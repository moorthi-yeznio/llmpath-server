import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { eq, sql } from 'drizzle-orm';
import type { UpdateProfileDto } from './dto/index.js';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../db/drizzle.constants.js';
import * as schema from '../db/schema.js';
import type { AppConfig } from '../config/index.js';
import type { AppUser, TenantMembershipRole } from './types/app-user.js';

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
        tenantId: schema.tenantMemberships.organisationId,
        role: schema.tenantMemberships.role,
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
        schema.tenantMemberships,
        eq(schema.tenantMemberships.userId, schema.users.id),
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
