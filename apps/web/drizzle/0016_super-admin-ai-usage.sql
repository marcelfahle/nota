CREATE TABLE "ai_model_changes" (
	"changed_at" timestamp DEFAULT now() NOT NULL,
	"changed_by" uuid NOT NULL,
	"feature" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" text,
	"org_id" uuid
);
--> statement-breakpoint
CREATE TABLE "ai_model_settings" (
	"changed_at" timestamp DEFAULT now() NOT NULL,
	"changed_by" uuid NOT NULL,
	"feature" text PRIMARY KEY NOT NULL,
	"model_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"feature" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"model_id" text NOT NULL,
	"org_id" uuid,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "ai_workspace_model_overrides" (
	"changed_at" timestamp DEFAULT now() NOT NULL,
	"changed_by" uuid NOT NULL,
	"feature" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" text NOT NULL,
	"org_id" uuid NOT NULL,
	CONSTRAINT "ai_workspace_model_overrides_org_feature_unique" UNIQUE("org_id","feature")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_super_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_model_changes" ADD CONSTRAINT "ai_model_changes_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_model_changes" ADD CONSTRAINT "ai_model_changes_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_model_settings" ADD CONSTRAINT "ai_model_settings_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace_model_overrides" ADD CONSTRAINT "ai_workspace_model_overrides_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workspace_model_overrides" ADD CONSTRAINT "ai_workspace_model_overrides_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_model_changes_changed_at_idx" ON "ai_model_changes" USING btree ("changed_at");--> statement-breakpoint
CREATE INDEX "ai_usage_created_at_idx" ON "ai_usage" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_org_created_at_idx" ON "ai_usage" USING btree ("org_id","created_at");