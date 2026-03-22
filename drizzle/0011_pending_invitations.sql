-- Migration: Add pending_invitations table for email-invite onboarding flow

CREATE TABLE "pending_invitations" (
  "id"              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "token"           text        NOT NULL UNIQUE,
  "email"           text        NOT NULL,
  "organisation_id" uuid        NOT NULL REFERENCES "organisations"("id"),
  "role"            text        NOT NULL,
  "invited_by"      uuid        NOT NULL REFERENCES "users"("id"),
  "invited_at"      timestamptz NOT NULL DEFAULT now(),
  "expires_at"      timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  "accepted_at"     timestamptz,
  "cancelled_at"    timestamptz
);

-- Fast lookup by token for the acceptance flow
CREATE INDEX ON "pending_invitations" ("token")
  WHERE "accepted_at" IS NULL AND "cancelled_at" IS NULL;

-- Fast lookup by email+org to cancel duplicates before re-inviting
CREATE INDEX ON "pending_invitations" ("email", "organisation_id")
  WHERE "accepted_at" IS NULL AND "cancelled_at" IS NULL;
