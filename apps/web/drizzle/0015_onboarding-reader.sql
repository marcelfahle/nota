CREATE TABLE "onboarding_sessions" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile" jsonb,
	"token_hash" text NOT NULL,
	CONSTRAINT "onboarding_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "reader_usage" (
	"bucket" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_reads" (
	"domain" text PRIMARY KEY NOT NULL,
	"profile" jsonb NOT NULL,
	"read_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX "onboarding_sessions_expires_idx" ON "onboarding_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "reader_usage_expires_idx" ON "reader_usage" USING btree ("expires_at");