import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../db/drizzle.constants.js';
import * as schema from '../db/schema.js';
import { SupabaseService } from '../supabase/supabase.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { TenantMembershipRole } from '../auth/types/app-user.js';

function isPgUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === '23505'
  );
}

@Injectable()
export class TenantsService {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly supabase: SupabaseService,
    private readonly audit: AuditService,
  ) {}

  async listTenants() {
    const rows = await this.db
      .select({
        id: schema.tenants.id,
        name: schema.tenants.name,
        slug: schema.tenants.slug,
        created_at: schema.tenants.createdAt,
      })
      .from(schema.tenants)
      .orderBy(schema.tenants.createdAt);
    return { tenants: rows };
  }

  async createTenant(name: string, slug: string, actorUserId: string) {
    try {
      const [row] = await this.db
        .insert(schema.tenants)
        .values({ name, slug })
        .returning({
          id: schema.tenants.id,
          name: schema.tenants.name,
          slug: schema.tenants.slug,
          created_at: schema.tenants.createdAt,
        });
      this.audit.log({
        actorUserId,
        entityType: 'tenant',
        entityId: row.id,
        action: 'CREATE',
        after: { name: row.name, slug: row.slug },
      });
      return { tenant: row };
    } catch (e: unknown) {
      if (isPgUniqueViolation(e)) {
        throw new ConflictException('Tenant slug already exists');
      }
      throw e;
    }
  }

  async updateTenant(
    tenantId: string,
    patch: { name?: string; slug?: string },
    actorUserId: string,
  ) {
    try {
      const [row] = await this.db
        .update(schema.tenants)
        .set(patch)
        .where(eq(schema.tenants.id, tenantId))
        .returning({
          id: schema.tenants.id,
          name: schema.tenants.name,
          slug: schema.tenants.slug,
          created_at: schema.tenants.createdAt,
        });
      if (!row) {
        throw new NotFoundException('Tenant not found');
      }
      this.audit.log({
        actorUserId,
        entityType: 'tenant',
        entityId: tenantId,
        action: 'UPDATE',
        after: patch,
      });
      return { tenant: row };
    } catch (e: unknown) {
      if (isPgUniqueViolation(e)) {
        throw new ConflictException('Tenant slug already exists');
      }
      throw e;
    }
  }

  async deleteTenant(tenantId: string, actorUserId: string) {
    const deleted = await this.db
      .delete(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .returning({ id: schema.tenants.id });
    if (!deleted.length) {
      throw new NotFoundException('Tenant not found');
    }
    this.audit.log({
      actorUserId,
      entityType: 'tenant',
      entityId: tenantId,
      action: 'DELETE',
    });
    return { deleted: true as const };
  }

  /**
   * Assigns a tenant admin role to a user.
   * Creates the user in Supabase Auth if they don't exist, then wraps the
   * local DB writes in a transaction for consistency.
   */
  async assignTenantAdmin(
    tenantId: string,
    email: string,
    password: string,
    actorUserId: string,
  ) {
    await this.assertTenantExists(tenantId);

    // Step 1: ensure user exists in Supabase Auth (outside transaction)
    let authUser = await this.supabase.getUserByEmail(email);
    if (!authUser) {
      authUser = await this.supabase.createUser(email, password);
    }
    const { id: userId } = authUser;

    // Step 2: upsert local shadow record + membership atomically
    await this.db.transaction(async (tx) => {
      await tx
        .insert(schema.users)
        .values({ id: userId, email, status: 'active' })
        .onConflictDoNothing();

      const [existing] = await tx
        .select()
        .from(schema.tenantMemberships)
        .where(
          and(
            eq(schema.tenantMemberships.tenantId, tenantId),
            eq(schema.tenantMemberships.userId, userId),
          ),
        )
        .limit(1);

      if (existing) {
        if (existing.role === 'tenant_admin') {
          throw new ConflictException(
            'User is already a tenant admin for this tenant',
          );
        }
        await tx
          .update(schema.tenantMemberships)
          .set({ role: 'tenant_admin' })
          .where(eq(schema.tenantMemberships.id, existing.id));
      } else {
        await tx.insert(schema.tenantMemberships).values({
          tenantId,
          userId,
          role: 'tenant_admin',
        });
      }
    });

    this.audit.log({
      actorUserId,
      entityType: 'tenant_membership',
      entityId: `${tenantId}:${userId}`,
      action: 'CREATE',
      after: { role: 'tenant_admin', userId, tenantId },
      tenantId,
    });

    return { user_id: userId, email, role: 'tenant_admin' as const };
  }

  async removeTenantAdmin(
    tenantId: string,
    userId: string,
    actorUserId: string,
  ) {
    const deleted = await this.db
      .delete(schema.tenantMemberships)
      .where(
        and(
          eq(schema.tenantMemberships.tenantId, tenantId),
          eq(schema.tenantMemberships.userId, userId),
          eq(schema.tenantMemberships.role, 'tenant_admin'),
        ),
      )
      .returning({ id: schema.tenantMemberships.id });
    if (!deleted.length) {
      throw new NotFoundException('Tenant admin membership not found');
    }
    this.audit.log({
      actorUserId,
      entityType: 'tenant_membership',
      entityId: `${tenantId}:${userId}`,
      action: 'DELETE',
      before: { role: 'tenant_admin', userId, tenantId },
      tenantId,
    });
    return { removed: true as const };
  }

  async listTenantUsers(tenantId: string) {
    await this.assertTenantExists(tenantId);
    const rows = await this.db
      .select({
        user_id: schema.tenantMemberships.userId,
        role: schema.tenantMemberships.role,
        email: schema.users.email,
        status: schema.users.status,
        created_at: schema.tenantMemberships.createdAt,
      })
      .from(schema.tenantMemberships)
      .innerJoin(
        schema.users,
        eq(schema.tenantMemberships.userId, schema.users.id),
      )
      .where(eq(schema.tenantMemberships.tenantId, tenantId));
    return { users: rows };
  }

  /**
   * Adds a member (tutor / student / finance_admin) to a tenant.
   * Creates the user in Supabase Auth if they don't exist.
   */
  async createTenantMember(
    tenantId: string,
    email: string,
    password: string,
    role: TenantMembershipRole,
    actorUserId: string,
  ) {
    await this.assertTenantExists(tenantId);

    let authUser = await this.supabase.getUserByEmail(email);
    if (!authUser) {
      authUser = await this.supabase.createUser(email, password);
    }
    const { id: userId } = authUser;

    await this.db.transaction(async (tx) => {
      await tx
        .insert(schema.users)
        .values({ id: userId, email, status: 'active' })
        .onConflictDoNothing();

      const [existing] = await tx
        .select()
        .from(schema.tenantMemberships)
        .where(
          and(
            eq(schema.tenantMemberships.tenantId, tenantId),
            eq(schema.tenantMemberships.userId, userId),
          ),
        )
        .limit(1);

      if (existing) {
        throw new ConflictException('User is already a member of this tenant');
      }

      await tx.insert(schema.tenantMemberships).values({
        tenantId,
        userId,
        role,
      });
    });

    this.audit.log({
      actorUserId,
      entityType: 'tenant_membership',
      entityId: `${tenantId}:${userId}`,
      action: 'CREATE',
      after: { role, userId, tenantId },
      tenantId,
    });

    return { user_id: userId, email, role };
  }

  async removeTenantMember(
    tenantId: string,
    userId: string,
    actorUserId: string,
  ) {
    const [membership] = await this.db
      .select({ role: schema.tenantMemberships.role })
      .from(schema.tenantMemberships)
      .where(
        and(
          eq(schema.tenantMemberships.tenantId, tenantId),
          eq(schema.tenantMemberships.userId, userId),
        ),
      )
      .limit(1);

    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    await this.db
      .delete(schema.tenantMemberships)
      .where(
        and(
          eq(schema.tenantMemberships.tenantId, tenantId),
          eq(schema.tenantMemberships.userId, userId),
        ),
      );

    this.audit.log({
      actorUserId,
      entityType: 'tenant_membership',
      entityId: `${tenantId}:${userId}`,
      action: 'DELETE',
      before: { role: membership.role, userId, tenantId },
      tenantId,
    });

    return { removed: true as const };
  }

  async patchTenantUser(
    tenantId: string,
    userId: string,
    patch: { banned?: boolean },
    actorUserId: string,
  ) {
    await this.assertTenantExists(tenantId);

    const [membership] = await this.db
      .select()
      .from(schema.tenantMemberships)
      .where(
        and(
          eq(schema.tenantMemberships.tenantId, tenantId),
          eq(schema.tenantMemberships.userId, userId),
        ),
      )
      .limit(1);

    if (!membership) {
      throw new NotFoundException('User is not a member of this tenant');
    }

    if (patch.banned === undefined) {
      return { updated: false as const };
    }

    // Update local status in a transaction
    await this.db.transaction(async (tx) => {
      await tx
        .update(schema.users)
        .set({
          status: patch.banned ? 'disabled' : 'active',
          updatedAt: new Date(),
        })
        .where(eq(schema.users.id, userId));
    });

    // Sync ban state to Supabase Auth (outside transaction — non-fatal if it fails)
    if (patch.banned) {
      await this.supabase.banUser(userId);
    } else {
      await this.supabase.unbanUser(userId);
    }

    this.audit.log({
      actorUserId,
      entityType: 'user',
      entityId: userId,
      action: patch.banned ? 'BAN' : 'UNBAN',
      after: { banned: patch.banned },
      tenantId,
    });

    return { user_id: userId, banned: patch.banned };
  }

  private async assertTenantExists(tenantId: string): Promise<void> {
    const [row] = await this.db
      .select({ id: schema.tenants.id })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .limit(1);
    if (!row) {
      throw new NotFoundException('Tenant not found');
    }
  }
}
