import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../db/drizzle.constants.js';
import * as schema from '../db/schema.js';
import { SupabaseService } from '../supabase/supabase.service.js';
import { AuditService } from '../audit/audit.service.js';
import { PermissionsService } from '../permissions/permissions.service.js';
import { MailService } from '../mail/mail.service.js';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/index.js';
import type { TenantMembershipRole } from '../auth/types/app-user.js';

const ROLE_LABELS: Record<string, string> = {
  tutor: 'Tutor',
  student: 'Student',
  finance_admin: 'Finance Admin',
  tenant_admin: 'Organisation Admin',
};

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
    private readonly permissionsService: PermissionsService,
    private readonly mail: MailService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async listTenants() {
    const rows = await this.db
      .select({
        id: schema.organisations.id,
        name: schema.organisations.name,
        slug: schema.organisations.slug,
        created_at: schema.organisations.createdAt,
      })
      .from(schema.organisations)
      .where(isNull(schema.organisations.deletedAt))
      .orderBy(schema.organisations.createdAt);
    return { organisations: rows };
  }

  async createTenant(name: string, slug: string, actorUserId: string) {
    try {
      const [row] = await this.db
        .insert(schema.organisations)
        .values({ name, slug })
        .returning({
          id: schema.organisations.id,
          name: schema.organisations.name,
          slug: schema.organisations.slug,
          created_at: schema.organisations.createdAt,
        });
      this.audit.log({
        actorUserId,
        entityType: 'tenant',
        entityId: row.id,
        action: 'CREATE',
        after: { name: row.name, slug: row.slug },
      });
      // Seed default role permissions for this tenant (fire-and-forget, non-blocking)
      void this.permissionsService.seedForTenant(row.id).catch(() => undefined);
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
        .update(schema.organisations)
        .set(patch)
        .where(eq(schema.organisations.id, tenantId))
        .returning({
          id: schema.organisations.id,
          name: schema.organisations.name,
          slug: schema.organisations.slug,
          created_at: schema.organisations.createdAt,
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
      .update(schema.organisations)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(schema.organisations.id, tenantId),
          isNull(schema.organisations.deletedAt),
        ),
      )
      .returning({ id: schema.organisations.id });
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
        .from(schema.organisationMemberships)
        .where(
          and(
            eq(schema.organisationMemberships.organisationId, tenantId),
            eq(schema.organisationMemberships.userId, userId),
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
          .update(schema.organisationMemberships)
          .set({ role: 'tenant_admin' })
          .where(eq(schema.organisationMemberships.id, existing.id));
      } else {
        await tx.insert(schema.organisationMemberships).values({
          organisationId: tenantId,
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
      .update(schema.organisationMemberships)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(schema.organisationMemberships.organisationId, tenantId),
          eq(schema.organisationMemberships.userId, userId),
          eq(schema.organisationMemberships.role, 'tenant_admin'),
          isNull(schema.organisationMemberships.deletedAt),
        ),
      )
      .returning({ id: schema.organisationMemberships.id });
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
        user_id: schema.organisationMemberships.userId,
        role: schema.organisationMemberships.role,
        email: schema.users.email,
        status: schema.users.status,
        created_at: schema.organisationMemberships.createdAt,
      })
      .from(schema.organisationMemberships)
      .innerJoin(
        schema.users,
        eq(schema.organisationMemberships.userId, schema.users.id),
      )
      .where(
        and(
          eq(schema.organisationMemberships.organisationId, tenantId),
          isNull(schema.organisationMemberships.deletedAt),
        ),
      );
    return { users: rows };
  }

  /**
   * Sends an email invite to a new member (tutor / student / finance_admin).
   * Does NOT create the Supabase user yet — that happens when the user accepts.
   * Cancels any existing pending invite for the same email + org before creating a new one.
   */
  async inviteTenantMember(
    tenantId: string,
    email: string,
    role: TenantMembershipRole,
    actorUserId: string,
    actorRole?: TenantMembershipRole,
  ) {
    await this.assertTenantExists(tenantId);

    // Validate role key exists in the roles catalogue
    const [knownRole] = await this.db
      .select({ key: schema.roles.key })
      .from(schema.roles)
      .where(eq(schema.roles.key, role))
      .limit(1);
    if (!knownRole) {
      throw new BadRequestException(`Unknown role '${role}'`);
    }

    // Enforce invite hierarchy using the permission policy
    if (actorRole) {
      const resourceMap: Partial<Record<TenantMembershipRole, string>> = {
        tutor: 'tutors',
        student: 'students',
        finance_admin: 'users',
        tenant_admin: 'users',
      };
      const resource = resourceMap[role];
      if (resource) {
        const canInvite = await this.permissionsService.hasPermission(
          tenantId,
          actorRole,
          resource,
          'invite',
        );
        if (!canInvite) {
          throw new ForbiddenException(
            `Your role does not have permission to invite ${role}`,
          );
        }
      }
    }

    // Per-org daily cap: max 50 invites per 24 hours
    const recentCount = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.pendingInvitations)
      .where(
        and(
          eq(schema.pendingInvitations.organisationId, tenantId),
          gt(
            schema.pendingInvitations.invitedAt,
            new Date(Date.now() - 24 * 60 * 60 * 1000),
          ),
        ),
      );
    if ((recentCount[0]?.count ?? 0) >= 50) {
      throw new BadRequestException(
        'Daily invite limit (50) reached for this organisation. Try again tomorrow.',
      );
    }

    // Cancel any existing pending invite for this email + org
    await this.db
      .update(schema.pendingInvitations)
      .set({ cancelledAt: new Date() })
      .where(
        and(
          eq(schema.pendingInvitations.email, email),
          eq(schema.pendingInvitations.organisationId, tenantId),
          isNull(schema.pendingInvitations.acceptedAt),
          isNull(schema.pendingInvitations.cancelledAt),
        ),
      );

    // Fetch org name for the email
    const [org] = await this.db
      .select({ name: schema.organisations.name })
      .from(schema.organisations)
      .where(eq(schema.organisations.id, tenantId))
      .limit(1);

    // Fetch inviter name for the email
    const [inviterProfile] = await this.db
      .select({ fullName: schema.profiles.fullName, email: schema.users.email })
      .from(schema.users)
      .leftJoin(schema.profiles, eq(schema.profiles.userId, schema.users.id))
      .where(eq(schema.users.id, actorUserId))
      .limit(1);
    const inviterName =
      inviterProfile?.fullName ?? inviterProfile?.email ?? 'Your administrator';

    // Generate secure token and create invitation row
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const [invitation] = await this.db
      .insert(schema.pendingInvitations)
      .values({
        token,
        email,
        organisationId: tenantId,
        role,
        invitedBy: actorUserId,
        expiresAt,
      })
      .returning({ id: schema.pendingInvitations.id });

    // Send invite email via Resend
    const appUrl = this.config.get('appUrl', { infer: true });
    const inviteUrl = `${appUrl}/en/onboard?token=${token}`;

    await this.mail.sendInvite(email, {
      orgName: org?.name ?? 'your organisation',
      inviterName,
      roleLabel: ROLE_LABELS[role] ?? role,
      inviteUrl,
    });

    this.audit.log({
      actorUserId,
      entityType: 'pending_invitation',
      entityId: invitation.id,
      action: 'CREATE',
      after: { email, role, tenantId },
      tenantId,
    });

    return { invitation_id: invitation.id, email, role };
  }

  /** Lists all pending (not accepted, not cancelled, not expired) invitations for a tenant. */
  async listTenantInvitations(tenantId: string) {
    await this.assertTenantExists(tenantId);
    const rows = await this.db
      .select({
        id: schema.pendingInvitations.id,
        email: schema.pendingInvitations.email,
        role: schema.pendingInvitations.role,
        invited_at: schema.pendingInvitations.invitedAt,
        expires_at: schema.pendingInvitations.expiresAt,
      })
      .from(schema.pendingInvitations)
      .where(
        and(
          eq(schema.pendingInvitations.organisationId, tenantId),
          isNull(schema.pendingInvitations.acceptedAt),
          isNull(schema.pendingInvitations.cancelledAt),
          gt(schema.pendingInvitations.expiresAt, new Date()),
        ),
      )
      .orderBy(schema.pendingInvitations.invitedAt);
    return { invitations: rows };
  }

  /** Cancels the old invite and sends a fresh one to the same email. */
  async resendInvite(invitationId: string, actorUserId: string) {
    const [inv] = await this.db
      .select()
      .from(schema.pendingInvitations)
      .where(
        and(
          eq(schema.pendingInvitations.id, invitationId),
          isNull(schema.pendingInvitations.acceptedAt),
          isNull(schema.pendingInvitations.cancelledAt),
        ),
      )
      .limit(1);

    if (!inv) {
      throw new NotFoundException(
        'Invitation not found or already accepted/cancelled',
      );
    }

    // Cancel old invite
    await this.db
      .update(schema.pendingInvitations)
      .set({ cancelledAt: new Date() })
      .where(eq(schema.pendingInvitations.id, invitationId));

    // Re-use the same email + org + role, issue a new token
    return this.inviteTenantMember(
      inv.organisationId,
      inv.email,
      inv.role as TenantMembershipRole,
      actorUserId,
    );
  }

  /** Marks an invitation as cancelled so the link no longer works. */
  async cancelInvite(invitationId: string, actorUserId: string) {
    const updated = await this.db
      .update(schema.pendingInvitations)
      .set({ cancelledAt: new Date() })
      .where(
        and(
          eq(schema.pendingInvitations.id, invitationId),
          isNull(schema.pendingInvitations.acceptedAt),
          isNull(schema.pendingInvitations.cancelledAt),
        ),
      )
      .returning({ id: schema.pendingInvitations.id });

    if (!updated.length) {
      throw new NotFoundException(
        'Invitation not found or already accepted/cancelled',
      );
    }

    this.audit.log({
      actorUserId,
      entityType: 'pending_invitation',
      entityId: invitationId,
      action: 'CANCEL',
    });

    return { cancelled: true as const };
  }

  async removeTenantMember(
    tenantId: string,
    userId: string,
    actorUserId: string,
  ) {
    const [membership] = await this.db
      .select({ role: schema.organisationMemberships.role })
      .from(schema.organisationMemberships)
      .where(
        and(
          eq(schema.organisationMemberships.organisationId, tenantId),
          eq(schema.organisationMemberships.userId, userId),
        ),
      )
      .limit(1);

    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    await this.db
      .update(schema.organisationMemberships)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(schema.organisationMemberships.organisationId, tenantId),
          eq(schema.organisationMemberships.userId, userId),
          isNull(schema.organisationMemberships.deletedAt),
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
      .from(schema.organisationMemberships)
      .where(
        and(
          eq(schema.organisationMemberships.organisationId, tenantId),
          eq(schema.organisationMemberships.userId, userId),
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
      .select({ id: schema.organisations.id })
      .from(schema.organisations)
      .where(
        and(
          eq(schema.organisations.id, tenantId),
          isNull(schema.organisations.deletedAt),
        ),
      )
      .limit(1);
    if (!row) {
      throw new NotFoundException('Tenant not found');
    }
  }
}
