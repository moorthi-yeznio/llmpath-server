-- Migration: Add soft-delete (deleted_at) to main entity tables

ALTER TABLE "organisations"              ADD COLUMN "deleted_at" timestamptz;
ALTER TABLE "organisation_memberships"   ADD COLUMN "deleted_at" timestamptz;
ALTER TABLE "courses"                    ADD COLUMN "deleted_at" timestamptz;
ALTER TABLE "batches"                    ADD COLUMN "deleted_at" timestamptz;
ALTER TABLE "tutor_profiles"             ADD COLUMN "deleted_at" timestamptz;
ALTER TABLE "tutor_certifications"       ADD COLUMN "deleted_at" timestamptz;
ALTER TABLE "tutor_social_links"         ADD COLUMN "deleted_at" timestamptz;
ALTER TABLE "student_profiles"           ADD COLUMN "deleted_at" timestamptz;
ALTER TABLE "student_emergency_contacts" ADD COLUMN "deleted_at" timestamptz;
ALTER TABLE "batch_enrollments"          ADD COLUMN "deleted_at" timestamptz;

-- Partial indexes for efficient filtering of non-deleted rows
CREATE INDEX ON "organisations"            ("deleted_at") WHERE "deleted_at" IS NULL;
CREATE INDEX ON "organisation_memberships" ("deleted_at") WHERE "deleted_at" IS NULL;
CREATE INDEX ON "courses"                  ("deleted_at") WHERE "deleted_at" IS NULL;
CREATE INDEX ON "batches"                  ("deleted_at") WHERE "deleted_at" IS NULL;
