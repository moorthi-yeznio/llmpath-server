CREATE TYPE "public"."tutor_availability" AS ENUM('available', 'on_leave', 'retired');--> statement-breakpoint
CREATE TABLE "tutor_profiles" (
	"user_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"bio" text,
	"specializations" text[],
	"experience_years" integer,
	"qualifications" text,
	"availability_status" "tutor_availability" NOT NULL DEFAULT 'available',
	"hourly_rate" numeric(10, 2),
	"max_students" integer,
	"updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tutor_certifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"issuer" varchar(200),
	"issued_at" date,
	"expires_at" date,
	"credential_url" text,
	"created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tutor_social_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"platform" varchar(50) NOT NULL,
	"url" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "tutor_profiles" ADD CONSTRAINT "tutor_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_profiles" ADD CONSTRAINT "tutor_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_certifications" ADD CONSTRAINT "tutor_certifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_certifications" ADD CONSTRAINT "tutor_certifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_social_links" ADD CONSTRAINT "tutor_social_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_social_links" ADD CONSTRAINT "tutor_social_links_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tutor_profiles_pk" ON "tutor_profiles" USING btree ("user_id", "tenant_id");--> statement-breakpoint
CREATE INDEX "tutor_profiles_tenant_id_idx" ON "tutor_profiles" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tutor_certs_user_tenant_idx" ON "tutor_certifications" USING btree ("user_id", "tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tutor_social_links_user_tenant_platform_idx" ON "tutor_social_links" USING btree ("user_id", "tenant_id", "platform");
