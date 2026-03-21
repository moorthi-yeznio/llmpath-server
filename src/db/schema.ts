import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
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
    maxStudents: integer('max_students'),
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
