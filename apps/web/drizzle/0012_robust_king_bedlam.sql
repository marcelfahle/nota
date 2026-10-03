CREATE TYPE "public"."invoice_kind" AS ENUM('invoice', 'credit_note');--> statement-breakpoint
CREATE TYPE "public"."invoice_source" AS ENUM('web', 'chat', 'mcp', 'api', 'cli', 'system');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('stripe', 'bank_transfer', 'other');--> statement-breakpoint
CREATE TYPE "public"."proposal_kind" AS ENUM('send_invoice', 'send_reminder', 'resend_with_bank_details');--> statement-breakpoint
CREATE TYPE "public"."proposal_status" AS ENUM('pending', 'approved', 'dismissed', 'expired', 'executed');--> statement-breakpoint
CREATE TYPE "public"."vat_status" AS ENUM('valid', 'invalid', 'unavailable');--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"page_context" jsonb,
	"parts" jsonb NOT NULL,
	"role" text NOT NULL,
	"thread_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_threads" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"amount" numeric(12, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"currency" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"method" "payment_method" NOT NULL,
	"note" text,
	"org_id" uuid NOT NULL,
	"received_at" timestamp NOT NULL,
	"source" "invoice_source" DEFAULT 'web' NOT NULL,
	"stripe_payment_intent_id" text,
	CONSTRAINT "payments_stripe_payment_intent_id_unique" UNIQUE("stripe_payment_intent_id")
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"decided_at" timestamp,
	"decided_by" uuid,
	"expires_at" timestamp,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid,
	"invoice_revision" integer,
	"kind" "proposal_kind" NOT NULL,
	"org_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"reason" text NOT NULL,
	"source_client" text,
	"status" "proposal_status" DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vat_checks" (
	"address" text,
	"checked_at" timestamp NOT NULL,
	"name" text,
	"status" "vat_status" NOT NULL,
	"vat_number" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_log" ADD COLUMN "source" "invoice_source" DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_log" ADD COLUMN "source_client" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "vat_registry_address" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "vat_registry_name" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "vat_status" "vat_status";--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "vat_verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "credits_invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "kind" "invoice_kind" DEFAULT 'invoice' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "public_token" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "source" "invoice_source" DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "source_client" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "brand_color" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "contact_email" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "credit_note_prefix" text DEFAULT 'CN' NOT NULL;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "favicon_url" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "invoice_layout" text DEFAULT 'classic' NOT NULL;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "legal_name" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "next_credit_note_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "postal_code" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "profile_sources" jsonb;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "region" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "street" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "vat_registry_address" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "vat_registry_name" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "vat_status" "vat_status";--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "vat_verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_thread_id_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_messages_thread_created_idx" ON "chat_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_threads_org_user_idx" ON "chat_threads" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "payments_invoice_id_idx" ON "payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "proposals_pending_invoice_kind_unique" ON "proposals" USING btree ("invoice_id","kind") WHERE "proposals"."status" = 'pending';--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_credits_invoice_id_invoices_id_fk" FOREIGN KEY ("credits_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
UPDATE "invoices"
SET "public_token" = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
WHERE "status" <> 'draft' AND "public_token" IS NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_public_token_unique" UNIQUE("public_token");--> statement-breakpoint
INSERT INTO "payments" ("invoice_id", "org_id", "amount", "currency", "received_at", "method", "note", "source")
SELECT "id", "org_id", "total", COALESCE("currency", 'EUR'), "paid_at"::timestamp, 'other', 'Backfilled from paid invoice', 'web'
FROM "invoices"
WHERE "status" = 'paid' AND "paid_at" IS NOT NULL AND "org_id" IS NOT NULL AND "total" IS NOT NULL;
