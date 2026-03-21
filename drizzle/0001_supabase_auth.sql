-- Migration: Supabase Auth integration
-- Removes custom auth tables/columns, expands role enum, adds audit_logs.

-- 1. Drop refresh_tokens table (Supabase Auth manages sessions)
DROP TABLE IF EXISTS "refresh_tokens";--> statement-breakpoint

-- 2. Drop password_hash and email_verified_at from users
ALTER TABLE "users" DROP COLUMN IF EXISTS "password_hash";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "email_verified_at";--> statement-breakpoint

-- 3. users.id is now set explicitly (no defaultRandom) — existing rows keep their UUIDs.
--    No SQL needed; the default is only a Drizzle hint for insert, not a DB constraint.

-- 4. Replace tenant_role enum: remove 'member', add 'tutor', 'student', 'finance_admin'.
--    PostgreSQL does not allow removing enum values; replace via a new type.
--    Existing 'member' rows are migrated to 'student'.
-- Create replacement type with final values.
CREATE TYPE "public"."tenant_role_new" AS ENUM('tenant_admin', 'tutor', 'student', 'finance_admin');--> statement-breakpoint
ALTER TABLE "tenant_memberships"
  ALTER COLUMN "role" TYPE "public"."tenant_role_new"
  USING (
    CASE "role"::text
      WHEN 'member' THEN 'student'
      ELSE "role"::text
    END
  )::"public"."tenant_role_new";--> statement-breakpoint
DROP TYPE "public"."tenant_role";--> statement-breakpoint
ALTER TYPE "public"."tenant_role_new" RENAME TO "tenant_role";--> statement-breakpoint

-- 5. Drop email column from tenant_memberships
ALTER TABLE "tenant_memberships" DROP COLUMN IF EXISTS "email";--> statement-breakpoint

-- 6. Create audit_logs table
CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actor_user_id" uuid NOT NULL,
  "entity_type" varchar(100) NOT NULL,
  "entity_id" varchar(100) NOT NULL,
  "action" varchar(50) NOT NULL,
  "before_json" jsonb,
  "after_json" jsonb,
  "tenant_id" uuid REFERENCES "public"."tenants"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type", "entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_tenant_idx" ON "audit_logs" USING btree ("tenant_id");
