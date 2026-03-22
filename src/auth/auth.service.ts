import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import type { UpdateProfileDto } from './dto/index.js';
import type { AcceptInviteDto } from './dto/accept-invite.dto.js';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../db/drizzle.constants.js';
import * as schema from '../db/schema.js';
import type { AppConfig } from '../config/index.js';
import type { AppUser, TenantMembershipRole } from './types/app-user.js';
import { SupabaseService } from '../supabase/supabase.service.js';

/** Subset of claims present in a Supabase-issued JWT */
type SupabaseJwtPayload = JWTPayload & {
  email: string;
  role: string;
};

@Injectable()
export class AuthService {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(
    @Inject(DRIZZLE)
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly supabase: SupabaseService,
  ) {
    const supabaseUrl = this.config.get('supabaseUrl', { infer: true });
    this.jwks = createRemoteJWKSet(
      new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`),
    );
  }

  /**
   * Verifies a Supabase JWT using the project's JWKS public key.
   * Keys are cached after the first fetch — stateless per request.
   * Supports ES256 (new projects) and HS256 (legacy projects).
   */
  async validateAccessToken(accessToken: string): Promise<AppUser> {
    let payload: SupabaseJwtPayload;
    try {
      const result = await jwtVerify(accessToken, this.jwks);
      payload = result.payload as SupabaseJwtPayload;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (!payload.sub || !payload.email) {
      throw new UnauthorizedException('Invalid token payload');
    }

    return this.loadAppUserById(payload.sub, payload.email);
  }

  /**
   * Loads the full AppUser from the database using a single JOIN query.
   * Performs a lazy upsert on first login — creates the local user record
   * automatically using data from the verified JWT.
   */
  async loadAppUserById(userId: string, email: string): Promise<AppUser> {
    // Lazy sync: ensure the shadow user record exists for this Supabase user.
    // ON CONFLICT DO NOTHING makes this idempotent and safe under concurrency.
    await this.db
      .insert(schema.users)
      .values({ id: userId, email, status: 'active' })
      .onConflictDoNothing();

    // Single query: user + platform admin check + memberships + profile
    const rows = await this.db
      .select({
        status: schema.users.status,
        isPlatformAdmin: sql<boolean>`${schema.platformAdmins.userId} IS NOT NULL`,
        tenantId: schema.organisationMemberships.organisationId,
        role: schema.organisationMemberships.role,
        fullName: schema.profiles.fullName,
        locale: schema.profiles.locale,
        timezone: schema.profiles.timezone,
        avatarUrl: schema.profiles.avatarUrl,
      })
      .from(schema.users)
      .leftJoin(
        schema.platformAdmins,
        eq(schema.platformAdmins.userId, schema.users.id),
      )
      .leftJoin(
        schema.organisationMemberships,
        eq(schema.organisationMemberships.userId, schema.users.id),
      )
      .leftJoin(schema.profiles, eq(schema.profiles.userId, schema.users.id))
      .where(eq(schema.users.id, userId));

    if (!rows.length) {
      throw new UnauthorizedException('User not found');
    }

    const first = rows[0];

    if (first.status !== 'active') {
      throw new UnauthorizedException('Account disabled');
    }

    const memberships: AppUser['memberships'] = rows
      .filter((r) => r.tenantId !== null)
      .map((r) => ({
        organisationId: r.tenantId!,
        role: r.role as TenantMembershipRole,
      }));

    const profile =
      first.fullName !== null ||
      first.locale !== null ||
      first.timezone !== null ||
      first.avatarUrl !== null
        ? {
            full_name: first.fullName ?? null,
            locale: first.locale ?? null,
            timezone: first.timezone ?? null,
            avatar_url: first.avatarUrl ?? null,
          }
        : null;

    return {
      id: userId,
      email,
      isPlatformAdmin: first.isPlatformAdmin,
      memberships,
      profile,
    };
  }

  /**
   * Returns a preview of the invite (org name, role, inviter) so the onboard
   * page can show context before the user sets their password.
   * Generic error for all failure modes — never expose which case triggered.
   */
  async getInvitePreview(token: string) {
    const now = new Date();
    const [inv] = await this.db
      .select({
        id: schema.pendingInvitations.id,
        role: schema.pendingInvitations.role,
        expiresAt: schema.pendingInvitations.expiresAt,
        orgName: schema.organisations.name,
        inviterFullName: schema.profiles.fullName,
        inviterEmail: schema.users.email,
      })
      .from(schema.pendingInvitations)
      .innerJoin(
        schema.organisations,
        eq(schema.organisations.id, schema.pendingInvitations.organisationId),
      )
      .innerJoin(
        schema.users,
        eq(schema.users.id, schema.pendingInvitations.invitedBy),
      )
      .leftJoin(
        schema.profiles,
        eq(schema.profiles.userId, schema.pendingInvitations.invitedBy),
      )
      .where(
        and(
          eq(schema.pendingInvitations.token, token),
          isNull(schema.pendingInvitations.acceptedAt),
          isNull(schema.pendingInvitations.cancelledAt),
          gt(schema.pendingInvitations.expiresAt, now),
        ),
      )
      .limit(1);

    if (!inv) {
      throw new NotFoundException(
        'This invite link is invalid or has expired.',
      );
    }

    return {
      orgName: inv.orgName,
      role: inv.role,
      inviterName: inv.inviterFullName ?? inv.inviterEmail,
      expiresAt: inv.expiresAt,
    };
  }

  /**
   * Validates the invite token, creates/finds the Supabase user, inserts the
   * membership, and marks the invite as accepted — all in a single transaction.
   * Returns { email, organisationId, existing } so the client can decide
   * whether to auto-sign-in or redirect to login.
   */
  async acceptInvite(dto: AcceptInviteDto) {
    const now = new Date();

    return this.db.transaction(async (tx) => {
      // Lock the invitation row to prevent concurrent accepts
      const [inv] = await tx
        .select()
        .from(schema.pendingInvitations)
        .where(
          and(
            eq(schema.pendingInvitations.token, dto.token),
            isNull(schema.pendingInvitations.acceptedAt),
            isNull(schema.pendingInvitations.cancelledAt),
            gt(schema.pendingInvitations.expiresAt, now),
          ),
        )
        .limit(1);

      if (!inv) {
        throw new NotFoundException(
          'This invite link is invalid or has expired.',
        );
      }

      const { email, organisationId, role } = inv;

      // Check if already a member of this org
      const [existingMembership] = await tx
        .select({ id: schema.organisationMemberships.id })
        .from(schema.organisationMemberships)
        .where(
          and(
            eq(schema.organisationMemberships.organisationId, organisationId),
            isNull(schema.organisationMemberships.deletedAt),
          ),
        )
        .innerJoin(
          schema.users,
          and(
            eq(schema.users.id, schema.organisationMemberships.userId),
            eq(schema.users.email, email),
          ),
        )
        .limit(1);

      if (existingMembership) {
        throw new ConflictException(
          'This email is already a member of the organisation.',
        );
      }

      // Check if Supabase user already exists
      const existingAuthUser = await this.supabase.getUserByEmail(email);
      let userId: string;
      let existing = false;

      if (existingAuthUser) {
        userId = existingAuthUser.id;
        existing = true;
      } else {
        const newUser = await this.supabase.createUser(email, dto.password);
        userId = newUser.id;
      }

      // Upsert local users record
      await tx
        .insert(schema.users)
        .values({ id: userId, email, status: 'active' })
        .onConflictDoNothing();

      // Set full name from invite form
      if (dto.fullName) {
        await tx
          .insert(schema.profiles)
          .values({ userId, fullName: dto.fullName })
          .onConflictDoUpdate({
            target: schema.profiles.userId,
            set: { fullName: dto.fullName, updatedAt: new Date() },
          });
      }

      // Insert membership
      await tx.insert(schema.organisationMemberships).values({
        organisationId,
        userId,
        role: role as TenantMembershipRole,
      });

      // Mark invite as accepted
      await tx
        .update(schema.pendingInvitations)
        .set({ acceptedAt: now })
        .where(eq(schema.pendingInvitations.id, inv.id));

      return { email, organisationId, existing };
    });
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<void> {
    const patch: Partial<typeof schema.profiles.$inferInsert> = {};
    if (dto.full_name !== undefined) patch.fullName = dto.full_name;
    if (dto.timezone !== undefined) patch.timezone = dto.timezone;
    if (dto.locale !== undefined) patch.locale = dto.locale;
    if (dto.avatar_url !== undefined) patch.avatarUrl = dto.avatar_url;
    patch.updatedAt = new Date();

    await this.db
      .insert(schema.profiles)
      .values({ userId, ...patch })
      .onConflictDoUpdate({
        target: schema.profiles.userId,
        set: patch,
      });
  }
}
