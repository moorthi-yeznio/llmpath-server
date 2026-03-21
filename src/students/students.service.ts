import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../db/drizzle.constants.js';
import * as schema from '../db/schema.js';
import { AuditService } from '../audit/audit.service.js';
import type { UpsertStudentProfileDto } from './dto/upsert-student-profile.dto.js';
import type { CreateStudentContactDto } from './dto/create-student-contact.dto.js';

// ─── Shared select shapes ─────────────────────────────────────────────────────

const PROFILE_SHAPE = {
  user_id: schema.studentProfiles.userId,
  tenant_id: schema.studentProfiles.tenantId,
  bio: schema.studentProfiles.bio,
  learning_goals: schema.studentProfiles.learningGoals,
  education_level: schema.studentProfiles.educationLevel,
  occupation: schema.studentProfiles.occupation,
  updated_at: schema.studentProfiles.updatedAt,
};

const CONTACT_SHAPE = {
  id: schema.studentEmergencyContacts.id,
  user_id: schema.studentEmergencyContacts.userId,
  tenant_id: schema.studentEmergencyContacts.tenantId,
  contact_name: schema.studentEmergencyContacts.contactName,
  relationship: schema.studentEmergencyContacts.relationship,
  phone: schema.studentEmergencyContacts.phone,
  email: schema.studentEmergencyContacts.email,
  created_at: schema.studentEmergencyContacts.createdAt,
};

@Injectable()
export class StudentsService {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly audit: AuditService,
  ) {}

  // ─── Profile ──────────────────────────────────────────────────────────────

  async getStudentProfile(tenantId: string, userId: string) {
    const [profileRow] = await this.db
      .select(PROFILE_SHAPE)
      .from(schema.studentProfiles)
      .where(
        and(
          eq(schema.studentProfiles.userId, userId),
          eq(schema.studentProfiles.tenantId, tenantId),
        ),
      );

    const contacts = await this.db
      .select(CONTACT_SHAPE)
      .from(schema.studentEmergencyContacts)
      .where(
        and(
          eq(schema.studentEmergencyContacts.userId, userId),
          eq(schema.studentEmergencyContacts.tenantId, tenantId),
        ),
      );

    return {
      profile: profileRow ?? null,
      emergency_contacts: contacts,
    };
  }

  async upsertStudentProfile(
    tenantId: string,
    userId: string,
    dto: UpsertStudentProfileDto,
    actorUserId: string,
  ) {
    const existing = await this.db
      .select(PROFILE_SHAPE)
      .from(schema.studentProfiles)
      .where(
        and(
          eq(schema.studentProfiles.userId, userId),
          eq(schema.studentProfiles.tenantId, tenantId),
        ),
      );

    const [row] = await this.db
      .insert(schema.studentProfiles)
      .values({
        userId,
        tenantId,
        bio: dto.bio ?? null,
        learningGoals: dto.learning_goals ?? null,
        educationLevel: dto.education_level ?? null,
        occupation: dto.occupation ?? null,
      })
      .onConflictDoUpdate({
        target: [
          schema.studentProfiles.userId,
          schema.studentProfiles.tenantId,
        ],
        set: {
          ...(dto.bio !== undefined && { bio: dto.bio }),
          ...(dto.learning_goals !== undefined && {
            learningGoals: dto.learning_goals,
          }),
          ...(dto.education_level !== undefined && {
            educationLevel: dto.education_level,
          }),
          ...(dto.occupation !== undefined && { occupation: dto.occupation }),
          updatedAt: new Date(),
        },
      })
      .returning(PROFILE_SHAPE);

    this.audit.log({
      actorUserId,
      entityType: 'student_profile',
      entityId: `${tenantId}:${userId}`,
      action: existing.length > 0 ? 'update' : 'create',
      tenantId,
      before: existing[0],
      after: row,
    });

    return { profile: row };
  }

  // ─── Emergency contacts ───────────────────────────────────────────────────

  async addEmergencyContact(
    tenantId: string,
    userId: string,
    dto: CreateStudentContactDto,
    actorUserId: string,
  ) {
    const [row] = await this.db
      .insert(schema.studentEmergencyContacts)
      .values({
        userId,
        tenantId,
        contactName: dto.contact_name,
        relationship: dto.relationship ?? null,
        phone: dto.phone,
        email: dto.email ?? null,
      })
      .returning(CONTACT_SHAPE);

    this.audit.log({
      actorUserId,
      entityType: 'student_emergency_contact',
      entityId: row.id,
      action: 'create',
      tenantId,
      after: row,
    });

    return { contact: row };
  }

  async removeEmergencyContact(
    tenantId: string,
    contactId: string,
    actorUserId: string,
  ) {
    const [existing] = await this.db
      .select(CONTACT_SHAPE)
      .from(schema.studentEmergencyContacts)
      .where(
        and(
          eq(schema.studentEmergencyContacts.id, contactId),
          eq(schema.studentEmergencyContacts.tenantId, tenantId),
        ),
      );

    if (!existing) throw new NotFoundException('Emergency contact not found');

    await this.db
      .delete(schema.studentEmergencyContacts)
      .where(
        and(
          eq(schema.studentEmergencyContacts.id, contactId),
          eq(schema.studentEmergencyContacts.tenantId, tenantId),
        ),
      );

    this.audit.log({
      actorUserId,
      entityType: 'student_emergency_contact',
      entityId: contactId,
      action: 'delete',
      tenantId,
      before: existing,
    });
  }
}
