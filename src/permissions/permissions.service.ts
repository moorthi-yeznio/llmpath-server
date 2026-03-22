import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../db/drizzle.constants.js';
import * as schema from '../db/schema.js';
import type { TenantMembershipRole } from '../auth/types/app-user.js';

/** Flat permission row returned to callers (frontend matrix, API response). */
export interface TenantRolePermission {
  role: string;
  resource: string;
  action: string;
  allowed: boolean;
}

/** Role definition returned as part of the enriched permissions payload. */
export interface RoleDefinition {
  key: string;
  label: string;
  isSystem: boolean;
  isAdmin: boolean;
}

/** Enriched permissions payload — roles metadata + full matrix for a tenant. */
export interface EnrichedPermissions {
  roles: RoleDefinition[];
  permissions: TenantRolePermission[];
}

// Simple in-memory cache per tenant — TTL 60 s
interface CacheEntry {
  data: Map<string, boolean>; // key = "role:resource:action"
  expiresAt: number;
}

@Injectable()
export class PermissionsService {
  private cache = new Map<string, CacheEntry>();

  constructor(
    @Inject(DRIZZLE)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  // ── Seeding ───────────────────────────────────────────────────────────────

  /** Bulk-insert default permissions for a newly created tenant (from role_permission_defaults). */
  async seedForTenant(tenantId: string): Promise<void> {
    const defaults = await this.db
      .select({
        roleKey: schema.rolePermissionDefaults.roleKey,
        resourceKey: schema.rolePermissionDefaults.resourceKey,
        actionKey: schema.rolePermissionDefaults.actionKey,
        allowed: schema.rolePermissionDefaults.allowed,
      })
      .from(schema.rolePermissionDefaults);

    if (!defaults.length) return;

    const values = defaults.map((d) => ({
      organisationId: tenantId,
      role: d.roleKey,
      resource: d.resourceKey,
      action: d.actionKey,
      allowed: d.allowed,
    }));

    await this.db
      .insert(schema.tenantRolePermissions)
      .values(values)
      .onConflictDoNothing();
  }

  // ── Permission check ──────────────────────────────────────────────────────

  /**
   * Returns true if the given role is allowed to perform `action` on `resource`
   * within `tenantId`. Falls back to role_permission_defaults if no DB row exists.
   */
  async hasPermission(
    tenantId: string,
    role: TenantMembershipRole,
    resource: string,
    action: string,
  ): Promise<boolean> {
    const map = await this.getMap(tenantId);
    const key = `${role}:${resource}:${action}`;
    if (map.has(key)) return map.get(key)!;

    // Fallback: check global defaults table
    const [def] = await this.db
      .select({ allowed: schema.rolePermissionDefaults.allowed })
      .from(schema.rolePermissionDefaults)
      .where(
        and(
          eq(schema.rolePermissionDefaults.roleKey, role),
          eq(schema.rolePermissionDefaults.resourceKey, resource),
          eq(schema.rolePermissionDefaults.actionKey, action),
        ),
      )
      .limit(1);

    return def?.allowed ?? false;
  }

  // ── Enriched matrix (roles + permissions) ────────────────────────────────

  /**
   * Returns all roles and permission rows for a tenant, merging DB rows with
   * global defaults so every cell is always represented.
   */
  async getEnrichedMatrix(tenantId: string): Promise<EnrichedPermissions> {
    const [allRoles, tenantRows, defaultRows] = await Promise.all([
      this.db
        .select({
          key: schema.roles.key,
          label: schema.roles.label,
          isSystem: schema.roles.isSystem,
          isAdmin: schema.roles.isAdmin,
        })
        .from(schema.roles)
        .orderBy(asc(schema.roles.sortOrder)),

      this.db
        .select({
          role: schema.tenantRolePermissions.role,
          resource: schema.tenantRolePermissions.resource,
          action: schema.tenantRolePermissions.action,
          allowed: schema.tenantRolePermissions.allowed,
        })
        .from(schema.tenantRolePermissions)
        .where(eq(schema.tenantRolePermissions.organisationId, tenantId)),

      this.db
        .select({
          roleKey: schema.rolePermissionDefaults.roleKey,
          resourceKey: schema.rolePermissionDefaults.resourceKey,
          actionKey: schema.rolePermissionDefaults.actionKey,
          allowed: schema.rolePermissionDefaults.allowed,
        })
        .from(schema.rolePermissionDefaults),
    ]);

    // Tenant overrides win over defaults
    const tenantMap = new Map<string, boolean>();
    for (const r of tenantRows) {
      tenantMap.set(`${r.role}:${r.resource}:${r.action}`, r.allowed);
    }

    // Build merged matrix from defaults, applying tenant overrides
    const permissions: TenantRolePermission[] = defaultRows.map((d) => {
      const key = `${d.roleKey}:${d.resourceKey}:${d.actionKey}`;
      return {
        role: d.roleKey,
        resource: d.resourceKey,
        action: d.actionKey,
        allowed: tenantMap.has(key) ? tenantMap.get(key)! : d.allowed,
      };
    });

    // Also include any tenant-specific rows not covered by defaults
    // (e.g. permissions for custom roles added after tenant creation)
    for (const r of tenantRows) {
      const key = `${r.role}:${r.resource}:${r.action}`;
      if (
        !permissions.some((p) => `${p.role}:${p.resource}:${p.action}` === key)
      ) {
        permissions.push({
          role: r.role,
          resource: r.resource,
          action: r.action,
          allowed: r.allowed,
        });
      }
    }

    return { roles: allRoles, permissions };
  }

  // ── Update ────────────────────────────────────────────────────────────────

  /** Upsert one permission cell and invalidate the tenant cache. */
  async updatePermission(
    tenantId: string,
    role: string,
    resource: string,
    action: string,
    allowed: boolean,
  ): Promise<void> {
    await this.db
      .insert(schema.tenantRolePermissions)
      .values({ organisationId: tenantId, role, resource, action, allowed })
      .onConflictDoUpdate({
        target: [
          schema.tenantRolePermissions.organisationId,
          schema.tenantRolePermissions.role,
          schema.tenantRolePermissions.resource,
          schema.tenantRolePermissions.action,
        ],
        set: { allowed },
      });
    this.cache.delete(tenantId);
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private async getMap(tenantId: string): Promise<Map<string, boolean>> {
    const cached = this.cache.get(tenantId);
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    const rows = await this.db
      .select({
        role: schema.tenantRolePermissions.role,
        resource: schema.tenantRolePermissions.resource,
        action: schema.tenantRolePermissions.action,
        allowed: schema.tenantRolePermissions.allowed,
      })
      .from(schema.tenantRolePermissions)
      .where(eq(schema.tenantRolePermissions.organisationId, tenantId));

    const map = new Map<string, boolean>();
    for (const r of rows)
      map.set(`${r.role}:${r.resource}:${r.action}`, r.allowed);

    this.cache.set(tenantId, { data: map, expiresAt: Date.now() + 60_000 });
    return map;
  }
}
