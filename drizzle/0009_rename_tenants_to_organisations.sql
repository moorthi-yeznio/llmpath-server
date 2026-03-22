-- Migration: Rename tenants → organisations
-- Run this migration, then update the application and restart.

-- 1. Rename tables
ALTER TABLE "tenants"                  RENAME TO "organisations";
ALTER TABLE "tenant_memberships"       RENAME TO "organisation_memberships";
ALTER TABLE "tenant_role_permissions"  RENAME TO "organisation_role_permissions";

-- 2. Rename tenant_id columns → organisation_id
ALTER TABLE "organisation_memberships"     RENAME COLUMN "tenant_id" TO "organisation_id";
ALTER TABLE "organisation_role_permissions" RENAME COLUMN "tenant_id" TO "organisation_id";
ALTER TABLE "courses"                      RENAME COLUMN "tenant_id" TO "organisation_id";
ALTER TABLE "tutor_profiles"               RENAME COLUMN "tenant_id" TO "organisation_id";
ALTER TABLE "tutor_certifications"         RENAME COLUMN "tenant_id" TO "organisation_id";
ALTER TABLE "tutor_social_links"           RENAME COLUMN "tenant_id" TO "organisation_id";
ALTER TABLE "student_profiles"             RENAME COLUMN "tenant_id" TO "organisation_id";
ALTER TABLE "student_emergency_contacts"   RENAME COLUMN "tenant_id" TO "organisation_id";
ALTER TABLE "batches"                      RENAME COLUMN "tenant_id" TO "organisation_id";
ALTER TABLE "batch_enrollments"            RENAME COLUMN "tenant_id" TO "organisation_id";
ALTER TABLE "audit_logs"                   RENAME COLUMN "tenant_id" TO "organisation_id";

-- 3. Rename indexes that reference old table/column names
ALTER INDEX IF EXISTS "tenants_slug_idx"                     RENAME TO "organisations_slug_idx";
ALTER INDEX IF EXISTS "tenant_memberships_tenant_user_idx"   RENAME TO "org_memberships_org_user_idx";
ALTER INDEX IF EXISTS "tenant_memberships_user_id_idx"       RENAME TO "org_memberships_user_id_idx";
