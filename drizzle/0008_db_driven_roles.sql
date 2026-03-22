-- ─── 1. Roles catalogue ───────────────────────────────────────────────────────
CREATE TABLE "roles" (
  "id"         uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  "key"        varchar(64)  NOT NULL,
  "label"      varchar(128) NOT NULL,
  "is_system"  boolean      NOT NULL DEFAULT false,
  "is_admin"   boolean      NOT NULL DEFAULT false,
  "sort_order" int          NOT NULL DEFAULT 0,
  "created_at" timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT "roles_key_unique" UNIQUE ("key")
);

-- ─── 2. Global default permission matrix ──────────────────────────────────────
CREATE TABLE "role_permission_defaults" (
  "id"           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "role_key"     varchar(64) NOT NULL REFERENCES "roles"("key") ON UPDATE CASCADE ON DELETE CASCADE,
  "resource_key" varchar(64) NOT NULL,
  "action_key"   varchar(64) NOT NULL,
  "allowed"      boolean     NOT NULL DEFAULT false,
  CONSTRAINT "rpd_uniq" UNIQUE ("role_key", "resource_key", "action_key")
);

CREATE INDEX "rpd_role_idx" ON "role_permission_defaults" ("role_key");

-- ─── 3. Seed system roles ─────────────────────────────────────────────────────
INSERT INTO "roles" ("key","label","is_system","is_admin","sort_order") VALUES
  ('tenant_admin',  'Tenant Admin',  true, true,  0),
  ('finance_admin', 'Finance Admin', true, false, 1),
  ('tutor',         'Tutor',         true, false, 2),
  ('student',       'Student',       true, false, 3);

-- ─── 4. Seed role_permission_defaults (84 rows) ───────────────────────────────
INSERT INTO "role_permission_defaults" ("role_key","resource_key","action_key","allowed") VALUES
  -- tenant_admin — full access
  ('tenant_admin','users','view',true),
  ('tenant_admin','users','invite',true),
  ('tenant_admin','users','edit',true),
  ('tenant_admin','users','delete',true),
  ('tenant_admin','tutors','view',true),
  ('tenant_admin','tutors','invite',true),
  ('tenant_admin','tutors','edit',true),
  ('tenant_admin','tutors','delete',true),
  ('tenant_admin','students','view',true),
  ('tenant_admin','students','invite',true),
  ('tenant_admin','students','edit',true),
  ('tenant_admin','students','delete',true),
  ('tenant_admin','courses','view',true),
  ('tenant_admin','courses','create',true),
  ('tenant_admin','courses','edit',true),
  ('tenant_admin','courses','delete',true),
  ('tenant_admin','batches','view',true),
  ('tenant_admin','batches','create',true),
  ('tenant_admin','batches','edit',true),
  ('tenant_admin','batches','delete',true),
  ('tenant_admin','batches','enroll',true),
  -- finance_admin — view-only on most resources
  ('finance_admin','users','view',true),
  ('finance_admin','users','invite',false),
  ('finance_admin','users','edit',false),
  ('finance_admin','users','delete',false),
  ('finance_admin','tutors','view',true),
  ('finance_admin','tutors','invite',false),
  ('finance_admin','tutors','edit',false),
  ('finance_admin','tutors','delete',false),
  ('finance_admin','students','view',true),
  ('finance_admin','students','invite',false),
  ('finance_admin','students','edit',false),
  ('finance_admin','students','delete',false),
  ('finance_admin','courses','view',true),
  ('finance_admin','courses','create',false),
  ('finance_admin','courses','edit',false),
  ('finance_admin','courses','delete',false),
  ('finance_admin','batches','view',true),
  ('finance_admin','batches','create',false),
  ('finance_admin','batches','edit',false),
  ('finance_admin','batches','delete',false),
  ('finance_admin','batches','enroll',false),
  -- tutor — manages courses/batches, can invite students
  ('tutor','users','view',false),
  ('tutor','users','invite',false),
  ('tutor','users','edit',false),
  ('tutor','users','delete',false),
  ('tutor','tutors','view',true),
  ('tutor','tutors','invite',false),
  ('tutor','tutors','edit',false),
  ('tutor','tutors','delete',false),
  ('tutor','students','view',true),
  ('tutor','students','invite',true),
  ('tutor','students','edit',false),
  ('tutor','students','delete',false),
  ('tutor','courses','view',true),
  ('tutor','courses','create',true),
  ('tutor','courses','edit',true),
  ('tutor','courses','delete',false),
  ('tutor','batches','view',true),
  ('tutor','batches','create',true),
  ('tutor','batches','edit',true),
  ('tutor','batches','delete',false),
  ('tutor','batches','enroll',true),
  -- student — view courses/batches only, can self-enroll
  ('student','users','view',false),
  ('student','users','invite',false),
  ('student','users','edit',false),
  ('student','users','delete',false),
  ('student','tutors','view',false),
  ('student','tutors','invite',false),
  ('student','tutors','edit',false),
  ('student','tutors','delete',false),
  ('student','students','view',false),
  ('student','students','invite',false),
  ('student','students','edit',false),
  ('student','students','delete',false),
  ('student','courses','view',true),
  ('student','courses','create',false),
  ('student','courses','edit',false),
  ('student','courses','delete',false),
  ('student','batches','view',true),
  ('student','batches','create',false),
  ('student','batches','edit',false),
  ('student','batches','delete',false),
  ('student','batches','enroll',true);

-- ─── 5. tenant_memberships.role → varchar ─────────────────────────────────────
ALTER TABLE "tenant_memberships" ALTER COLUMN "role" TYPE varchar(64) USING "role"::text;

-- ─── 6. tenant_role_permissions.role → varchar ────────────────────────────────
ALTER TABLE "tenant_role_permissions" ALTER COLUMN "role" TYPE varchar(64) USING "role"::text;

-- ─── 7. Drop the PostgreSQL enum ──────────────────────────────────────────────
DROP TYPE IF EXISTS "tenant_role";
