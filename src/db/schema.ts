import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  date,
  timestamp,
  pgEnum,
  uniqueIndex,
  index,
  jsonb,
} from 'drizzle-orm/pg-core';

export const userStatusEnum = pgEnum('user_status', ['active', 'disabled']);

/**
 * tenant_role covers all domain roles within a tenant.
 * - tenant_admin: manages the tenant (users, settings)
 * - tutor: delivers sessions and manages batch content
 * - student: enrolled learner
 * - finance_admin: manages invoices and payments
 */
export const tenantRoleEnum = pgEnum('tenant_role', [
  'tenant_admin',
  'tutor',
  'student',
  'finance_admin',
]);

/**
 * Shadow table for Supabase Auth users.
 * `id` is set explicitly to the Supabase auth user UUID — not generated here.
 * Supabase Auth manages passwords, sessions, and refresh tokens.
 * This table stores application-level state (ban status) and provides
 * a FK anchor for all other tables.
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: varchar('email', { length: 320 }).notNull().unique(),
  status: userStatusEnum('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const profiles = pgTable('profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  fullName: varchar('full_name', { length: 200 }),
  locale: varchar('locale', { length: 32 }),
  timezone: varchar('timezone', { length: 64 }),
  avatarUrl: text('avatar_url'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const tenants = pgTable(
  'tenants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 200 }).notNull(),
    slug: varchar('slug', { length: 80 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex('tenants_slug_idx').on(t.slug)],
);

export const platformAdmins = pgTable('platform_admins', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
});

export const tenantMemberships = pgTable(
  'tenant_memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: tenantRoleEnum('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('tenant_memberships_tenant_user_idx').on(t.tenantId, t.userId),
    index('tenant_memberships_user_id_idx').on(t.userId),
  ],
);

export const courseStatusEnum = pgEnum('course_status', ['draft', 'published']);
export const courseLevelEnum = pgEnum('course_level', [
  'beginner',
  'intermediate',
  'advanced',
]);

export const courses = pgTable(
  'courses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    status: courseStatusEnum('status').notNull().default('draft'),
    thumbnailUrl: text('thumbnail_url'),
    durationMinutes: integer('duration_minutes'),
    level: courseLevelEnum('level'),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('courses_tenant_id_idx').on(t.tenantId)],
);

// ─── Tutor profiles ───────────────────────────────────────────────────────────

export const tutorAvailabilityEnum = pgEnum('tutor_availability', [
  'available',
  'on_leave',
  'retired',
]);

export const tutorProfiles = pgTable(
  'tutor_profiles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    bio: text('bio'),
    specializations: text('specializations').array(),
    experienceYears: integer('experience_years'),
    qualifications: text('qualifications'),
    availabilityStatus: tutorAvailabilityEnum('availability_status')
      .notNull()
      .default('available'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('tutor_profiles_pk').on(t.userId, t.tenantId),
    index('tutor_profiles_tenant_id_idx').on(t.tenantId),
  ],
);

export const tutorCertifications = pgTable(
  'tutor_certifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    issuer: varchar('issuer', { length: 200 }),
    issuedAt: date('issued_at'),
    expiresAt: date('expires_at'),
    credentialUrl: text('credential_url'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('tutor_certs_user_tenant_idx').on(t.userId, t.tenantId)],
);

export const tutorSocialLinks = pgTable(
  'tutor_social_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    platform: varchar('platform', { length: 50 }).notNull(),
    url: text('url').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('tutor_social_links_user_tenant_platform_idx').on(
      t.userId,
      t.tenantId,
      t.platform,
    ),
  ],
);

// ─── Student profiles ─────────────────────────────────────────────────────────

export const studentEducationLevelEnum = pgEnum('student_education_level', [
  'high_school',
  'undergraduate',
  'postgraduate',
  'professional',
  'other',
]);

export const studentProfiles = pgTable(
  'student_profiles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    bio: text('bio'),
    learningGoals: text('learning_goals'),
    educationLevel: studentEducationLevelEnum('education_level'),
    occupation: varchar('occupation', { length: 200 }),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('student_profiles_pk').on(t.userId, t.tenantId),
    index('student_profiles_tenant_id_idx').on(t.tenantId),
  ],
);

export const studentEmergencyContacts = pgTable(
  'student_emergency_contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    contactName: varchar('contact_name', { length: 200 }).notNull(),
    relationship: varchar('relationship', { length: 100 }),
    phone: varchar('phone', { length: 50 }).notNull(),
    email: varchar('email', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('student_contacts_user_tenant_idx').on(t.userId, t.tenantId)],
);

// ─── Batches ──────────────────────────────────────────────────────────────────

export const batchStatusEnum = pgEnum('batch_status', [
  'draft',
  'active',
  'completed',
  'cancelled',
]);

export const batches = pgTable(
  'batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    tutorId: uuid('tutor_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    name: varchar('name', { length: 200 }).notNull(),
    status: batchStatusEnum('status').notNull().default('draft'),
    startDate: date('start_date'),
    endDate: date('end_date'),
    maxStudents: integer('max_students'),
    joinCode: varchar('join_code', { length: 20 }).notNull().unique(),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('batches_tenant_id_idx').on(t.tenantId),
    index('batches_course_id_idx').on(t.courseId),
    uniqueIndex('batches_join_code_idx').on(t.joinCode),
  ],
);

export const batchEnrollments = pgTable(
  'batch_enrollments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => batches.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    enrolledBy: uuid('enrolled_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    enrolledAt: timestamp('enrolled_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('batch_enrollments_batch_student_idx').on(
      t.batchId,
      t.studentId,
    ),
    index('batch_enrollments_batch_id_idx').on(t.batchId),
    index('batch_enrollments_student_id_idx').on(t.studentId),
  ],
);

/**
 * Immutable audit log. Written fire-and-forget by AuditService.
 * actorUserId has no FK — actor may be a system process.
 * entityId is varchar to support composite IDs in future modules.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorUserId: uuid('actor_user_id').notNull(),
    entityType: varchar('entity_type', { length: 100 }).notNull(),
    entityId: varchar('entity_id', { length: 100 }).notNull(),
    action: varchar('action', { length: 50 }).notNull(),
    beforeJson: jsonb('before_json'),
    afterJson: jsonb('after_json'),
    tenantId: uuid('tenant_id').references(() => tenants.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('audit_logs_actor_idx').on(t.actorUserId),
    index('audit_logs_entity_idx').on(t.entityType, t.entityId),
    index('audit_logs_tenant_idx').on(t.tenantId),
  ],
);
