import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  date,
  timestamp,
  pgEnum,
  uniqueIndex,
  index,
  jsonb,
} from 'drizzle-orm/pg-core';

export const userStatusEnum = pgEnum('user_status', ['active', 'disabled']);

// ─── Roles catalogue (platform-managed, DB-driven) ────────────────────────────

/**
 * Global role catalogue. Platform admins create/edit/delete roles here.
 * System roles (is_system=true) cannot be deleted.
 * Admin roles (is_admin=true) bypass all permission checks.
 */
export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: varchar('key', { length: 64 }).notNull().unique(),
  label: varchar('label', { length: 128 }).notNull(),
  isSystem: boolean('is_system').notNull().default(false),
  isAdmin: boolean('is_admin').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Global default permission matrix. One row per (role_key, resource_key, action_key).
 * Used as fallback when an organisation has no custom override for a cell.
 * Seeded with sensible defaults for system roles; new roles start deny-all.
 */
export const rolePermissionDefaults = pgTable(
  'role_permission_defaults',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roleKey: varchar('role_key', { length: 64 })
      .notNull()
      .references(() => roles.key, {
        onUpdate: 'cascade',
        onDelete: 'cascade',
      }),
    resourceKey: varchar('resource_key', { length: 64 }).notNull(),
    actionKey: varchar('action_key', { length: 64 }).notNull(),
    allowed: boolean('allowed').notNull().default(false),
  },
  (t) => [
    uniqueIndex('rpd_uniq').on(t.roleKey, t.resourceKey, t.actionKey),
    index('rpd_role_idx').on(t.roleKey),
  ],
);

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

export const organisations = pgTable(
  'organisations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 200 }).notNull(),
    slug: varchar('slug', { length: 80 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('organisations_slug_idx').on(t.slug)],
);

/** @deprecated Use organisations */
export const tenants = organisations;

export const platformAdmins = pgTable('platform_admins', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
});

export const organisationMemberships = pgTable(
  'organisation_memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('org_memberships_org_user_idx').on(t.organisationId, t.userId),
    index('org_memberships_user_id_idx').on(t.userId),
  ],
);

/** @deprecated Use organisationMemberships */
export const tenantMemberships = organisationMemberships;

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
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
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
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('courses_org_id_idx').on(t.organisationId)],
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
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
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
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('tutor_profiles_pk').on(t.userId, t.organisationId),
    index('tutor_profiles_org_id_idx').on(t.organisationId),
  ],
);

export const tutorCertifications = pgTable(
  'tutor_certifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    issuer: varchar('issuer', { length: 200 }),
    issuedAt: date('issued_at'),
    expiresAt: date('expires_at'),
    credentialUrl: text('credential_url'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('tutor_certs_user_org_idx').on(t.userId, t.organisationId)],
);

export const tutorSocialLinks = pgTable(
  'tutor_social_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    platform: varchar('platform', { length: 50 }).notNull(),
    url: text('url').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('tutor_social_links_user_org_platform_idx').on(
      t.userId,
      t.organisationId,
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
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    bio: text('bio'),
    learningGoals: text('learning_goals'),
    educationLevel: studentEducationLevelEnum('education_level'),
    occupation: varchar('occupation', { length: 200 }),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('student_profiles_pk').on(t.userId, t.organisationId),
    index('student_profiles_org_id_idx').on(t.organisationId),
  ],
);

export const studentEmergencyContacts = pgTable(
  'student_emergency_contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    contactName: varchar('contact_name', { length: 200 }).notNull(),
    relationship: varchar('relationship', { length: 100 }),
    phone: varchar('phone', { length: 50 }).notNull(),
    email: varchar('email', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('student_contacts_user_org_idx').on(t.userId, t.organisationId),
  ],
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
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
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
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('batches_org_id_idx').on(t.organisationId),
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
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    enrolledBy: uuid('enrolled_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    enrolledAt: timestamp('enrolled_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
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

// ─── Organisation role permissions ────────────────────────────────────────────

/**
 * Per-organisation permission policy. Stores one row per (organisation, role, resource, action).
 * Seeded with defaults on organisation creation. Organisation admins can override any cell.
 */
export const organisationRolePermissions = pgTable(
  'organisation_role_permissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 64 }).notNull(),
    resource: varchar('resource', { length: 64 }).notNull(),
    action: varchar('action', { length: 64 }).notNull(),
    allowed: boolean('allowed').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('orp_uniq').on(t.organisationId, t.role, t.resource, t.action),
    index('orp_org_idx').on(t.organisationId),
  ],
);

/** @deprecated Use organisationRolePermissions */
export const tenantRolePermissions = organisationRolePermissions;

// ─── Pending invitations ──────────────────────────────────────────────────────

/**
 * Tracks email invitations sent to new users.
 * Token is a 32-byte crypto-random hex string (64 chars).
 * Invitation is valid until expires_at, and only once (accepted_at becomes non-null on use).
 */
export const pendingInvitations = pgTable(
  'pending_invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    token: text('token').notNull().unique(),
    email: varchar('email', { length: 320 }).notNull(),
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 64 }).notNull(),
    invitedBy: uuid('invited_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    invitedAt: timestamp('invited_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  },
  (t) => [
    index('pending_invitations_token_idx').on(t.token),
    index('pending_invitations_email_org_idx').on(t.email, t.organisationId),
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
    organisationId: uuid('organisation_id').references(() => organisations.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('audit_logs_actor_idx').on(t.actorUserId),
    index('audit_logs_entity_idx').on(t.entityType, t.entityId),
    index('audit_logs_org_idx').on(t.organisationId),
  ],
);
