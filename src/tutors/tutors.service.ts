import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../db/drizzle.constants.js';
import * as schema from '../db/schema.js';
import { AuditService } from '../audit/audit.service.js';
import type { UpsertTutorProfileDto } from './dto/upsert-tutor-profile.dto.js';
import type { CreateTutorCertificationDto } from './dto/create-tutor-certification.dto.js';
import type { CreateTutorSocialLinkDto } from './dto/create-tutor-social-link.dto.js';

// ─── Shared select shapes ─────────────────────────────────────────────────────

const PROFILE_SHAPE = {
  user_id: schema.tutorProfiles.userId,
  tenant_id: schema.tutorProfiles.organisationId,
  bio: schema.tutorProfiles.bio,
  specializations: schema.tutorProfiles.specializations,
  experience_years: schema.tutorProfiles.experienceYears,
  qualifications: schema.tutorProfiles.qualifications,
  availability_status: schema.tutorProfiles.availabilityStatus,
  updated_at: schema.tutorProfiles.updatedAt,
};

const CERT_SHAPE = {
  id: schema.tutorCertifications.id,
  user_id: schema.tutorCertifications.userId,
  tenant_id: schema.tutorCertifications.organisationId,
  name: schema.tutorCertifications.name,
  issuer: schema.tutorCertifications.issuer,
  issued_at: schema.tutorCertifications.issuedAt,
  expires_at: schema.tutorCertifications.expiresAt,
  credential_url: schema.tutorCertifications.credentialUrl,
  created_at: schema.tutorCertifications.createdAt,
};

const LINK_SHAPE = {
  id: schema.tutorSocialLinks.id,
  user_id: schema.tutorSocialLinks.userId,
  tenant_id: schema.tutorSocialLinks.organisationId,
  platform: schema.tutorSocialLinks.platform,
  url: schema.tutorSocialLinks.url,
  created_at: schema.tutorSocialLinks.createdAt,
};

@Injectable()
export class TutorsService {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly audit: AuditService,
  ) {}

  // ─── Profile ──────────────────────────────────────────────────────────────

  async getTutorProfile(tenantId: string, userId: string) {
    const [profileRow] = await this.db
      .select(PROFILE_SHAPE)
      .from(schema.tutorProfiles)
      .where(
        and(
          eq(schema.tutorProfiles.userId, userId),
          eq(schema.tutorProfiles.organisationId, tenantId),
        ),
      );

    const [certifications, socialLinks] = await Promise.all([
      this.db
        .select(CERT_SHAPE)
        .from(schema.tutorCertifications)
        .where(
          and(
            eq(schema.tutorCertifications.userId, userId),
            eq(schema.tutorCertifications.organisationId, tenantId),
          ),
        ),
      this.db
        .select(LINK_SHAPE)
        .from(schema.tutorSocialLinks)
        .where(
          and(
            eq(schema.tutorSocialLinks.userId, userId),
            eq(schema.tutorSocialLinks.organisationId, tenantId),
          ),
        ),
    ]);

    return {
      profile: profileRow ?? null,
      certifications,
      social_links: socialLinks,
    };
  }

  async upsertTutorProfile(
    tenantId: string,
    userId: string,
    dto: UpsertTutorProfileDto,
    actorUserId: string,
  ) {
    const existing = await this.db
      .select(PROFILE_SHAPE)
      .from(schema.tutorProfiles)
      .where(
        and(
          eq(schema.tutorProfiles.userId, userId),
          eq(schema.tutorProfiles.organisationId, tenantId),
        ),
      );

    const [row] = await this.db
      .insert(schema.tutorProfiles)
      .values({
        userId,
        organisationId: tenantId,
        bio: dto.bio ?? null,
        specializations: dto.specializations ?? null,
        experienceYears: dto.experience_years ?? null,
        qualifications: dto.qualifications ?? null,
        availabilityStatus: dto.availability_status ?? 'available',
      })
      .onConflictDoUpdate({
        target: [
          schema.tutorProfiles.userId,
          schema.tutorProfiles.organisationId,
        ],
        set: {
          ...(dto.bio !== undefined && { bio: dto.bio }),
          ...(dto.specializations !== undefined && {
            specializations: dto.specializations,
          }),
          ...(dto.experience_years !== undefined && {
            experienceYears: dto.experience_years,
          }),
          ...(dto.qualifications !== undefined && {
            qualifications: dto.qualifications,
          }),
          ...(dto.availability_status !== undefined && {
            availabilityStatus: dto.availability_status,
          }),
          updatedAt: new Date(),
        },
      })
      .returning(PROFILE_SHAPE);

    this.audit.log({
      actorUserId,
      entityType: 'tutor_profile',
      entityId: `${tenantId}:${userId}`,
      action: existing.length > 0 ? 'update' : 'create',
      tenantId,
      before: existing[0],
      after: row,
    });

    return { profile: row };
  }

  // ─── Certifications ───────────────────────────────────────────────────────

  async addCertification(
    tenantId: string,
    userId: string,
    dto: CreateTutorCertificationDto,
    actorUserId: string,
  ) {
    const [row] = await this.db
      .insert(schema.tutorCertifications)
      .values({
        userId,
        organisationId: tenantId,
        name: dto.name,
        issuer: dto.issuer ?? null,
        issuedAt: dto.issued_at ?? null,
        expiresAt: dto.expires_at ?? null,
        credentialUrl: dto.credential_url ?? null,
      })
      .returning(CERT_SHAPE);

    this.audit.log({
      actorUserId,
      entityType: 'tutor_certification',
      entityId: row.id,
      action: 'create',
      tenantId,
      after: row,
    });

    return { certification: row };
  }

  async removeCertification(
    tenantId: string,
    certId: string,
    actorUserId: string,
  ) {
    const [existing] = await this.db
      .select(CERT_SHAPE)
      .from(schema.tutorCertifications)
      .where(
        and(
          eq(schema.tutorCertifications.id, certId),
          eq(schema.tutorCertifications.organisationId, tenantId),
        ),
      );

    if (!existing) throw new NotFoundException('Certification not found');

    await this.db
      .delete(schema.tutorCertifications)
      .where(
        and(
          eq(schema.tutorCertifications.id, certId),
          eq(schema.tutorCertifications.organisationId, tenantId),
        ),
      );

    this.audit.log({
      actorUserId,
      entityType: 'tutor_certification',
      entityId: certId,
      action: 'delete',
      tenantId,
      before: existing,
    });
  }

  // ─── Social links ─────────────────────────────────────────────────────────

  async upsertSocialLink(
    tenantId: string,
    userId: string,
    dto: CreateTutorSocialLinkDto,
    actorUserId: string,
  ) {
    const [row] = await this.db
      .insert(schema.tutorSocialLinks)
      .values({
        userId,
        organisationId: tenantId,
        platform: dto.platform,
        url: dto.url,
      })
      .onConflictDoUpdate({
        target: [
          schema.tutorSocialLinks.userId,
          schema.tutorSocialLinks.organisationId,
          schema.tutorSocialLinks.platform,
        ],
        set: { url: dto.url },
      })
      .returning(LINK_SHAPE);

    this.audit.log({
      actorUserId,
      entityType: 'tutor_social_link',
      entityId: row.id,
      action: 'upsert',
      tenantId,
      after: row,
    });

    return { social_link: row };
  }

  async removeSocialLink(
    tenantId: string,
    linkId: string,
    actorUserId: string,
  ) {
    const [existing] = await this.db
      .select(LINK_SHAPE)
      .from(schema.tutorSocialLinks)
      .where(
        and(
          eq(schema.tutorSocialLinks.id, linkId),
          eq(schema.tutorSocialLinks.organisationId, tenantId),
        ),
      );

    if (!existing) throw new NotFoundException('Social link not found');

    await this.db
      .delete(schema.tutorSocialLinks)
      .where(
        and(
          eq(schema.tutorSocialLinks.id, linkId),
          eq(schema.tutorSocialLinks.organisationId, tenantId),
        ),
      );

    this.audit.log({
      actorUserId,
      entityType: 'tutor_social_link',
      entityId: linkId,
      action: 'delete',
      tenantId,
      before: existing,
    });
  }
}
