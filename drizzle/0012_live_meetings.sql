-- LiveKit-backed ad-hoc meetings and local egress recording metadata

CREATE TYPE "live_meeting_status" AS ENUM ('active', 'ended');
CREATE TYPE "live_meeting_recording_status" AS ENUM (
  'starting',
  'active',
  'completed',
  'failed',
  'aborted'
);

CREATE TABLE "live_meetings" (
  "id"                 uuid                  PRIMARY KEY DEFAULT gen_random_uuid(),
  "host_user_id"       uuid                  NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "organisation_id"    uuid                  NOT NULL REFERENCES "organisations"("id") ON DELETE CASCADE,
  "livekit_room_name"  varchar(128)          NOT NULL UNIQUE,
  "title"              varchar(200),
  "status"             "live_meeting_status" NOT NULL DEFAULT 'active',
  "created_at"         timestamptz           NOT NULL DEFAULT now(),
  "updated_at"         timestamptz           NOT NULL DEFAULT now()
);

CREATE INDEX "live_meetings_host_idx" ON "live_meetings" ("host_user_id");
CREATE INDEX "live_meetings_status_idx" ON "live_meetings" ("status");
CREATE INDEX "live_meetings_org_idx" ON "live_meetings" ("organisation_id");

CREATE TABLE "live_meeting_recordings" (
  "id"                   uuid                               PRIMARY KEY DEFAULT gen_random_uuid(),
  "meeting_id"           uuid                               NOT NULL REFERENCES "live_meetings"("id") ON DELETE CASCADE,
  "egress_id"            varchar(128)                       NOT NULL UNIQUE,
  "relative_file_path"   varchar(512),
  "status"               "live_meeting_recording_status"    NOT NULL DEFAULT 'starting',
  "error_message"        text,
  "created_at"           timestamptz                        NOT NULL DEFAULT now(),
  "completed_at"         timestamptz
);

CREATE INDEX "live_meeting_recordings_meeting_idx" ON "live_meeting_recordings" ("meeting_id");
CREATE INDEX "live_meeting_recordings_status_idx" ON "live_meeting_recordings" ("status");
