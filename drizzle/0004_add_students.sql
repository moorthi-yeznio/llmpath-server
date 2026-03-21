CREATE TYPE "public"."student_education_level" AS ENUM('high_school', 'undergraduate', 'postgraduate', 'professional', 'other');--> statement-breakpoint
CREATE TABLE "student_profiles" (
	"user_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"bio" text,
	"learning_goals" text,
	"education_level" "student_education_level",
	"occupation" varchar(200),
	"updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "student_emergency_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"contact_name" varchar(200) NOT NULL,
	"relationship" varchar(100),
	"phone" varchar(50) NOT NULL,
	"email" varchar(255),
	"created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_emergency_contacts" ADD CONSTRAINT "student_emergency_contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_emergency_contacts" ADD CONSTRAINT "student_emergency_contacts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "student_profiles_pk" ON "student_profiles" USING btree ("user_id", "tenant_id");--> statement-breakpoint
CREATE INDEX "student_profiles_tenant_id_idx" ON "student_profiles" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "student_contacts_user_tenant_idx" ON "student_emergency_contacts" USING btree ("user_id", "tenant_id");
