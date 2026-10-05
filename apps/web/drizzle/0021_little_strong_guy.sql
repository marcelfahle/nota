CREATE TABLE "invoice_number_events" (
	"action" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid,
	"kind" "invoice_kind" NOT NULL,
	"metadata" jsonb,
	"number" text NOT NULL,
	"org_id" uuid NOT NULL,
	"source" "invoice_source" DEFAULT 'web' NOT NULL,
	"source_client" text
);
--> statement-breakpoint
ALTER TABLE "invoice_number_events" ADD CONSTRAINT "invoice_number_events_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_number_events" ADD CONSTRAINT "invoice_number_events_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "invoice_number_events" ("action", "created_at", "invoice_id", "kind", "metadata", "number", "org_id", "source", "source_client")
SELECT
	CASE WHEN "status" = 'draft' THEN 'legacy_draft_reserved' ELSE 'legacy_number_preserved' END,
	COALESCE("created_at", now()),
	"id",
	"kind",
	jsonb_build_object('migration', '0021_little_strong_guy', 'status', "status"),
	"number",
	"org_id",
	"source",
	"source_client"
FROM "invoices"
WHERE "org_id" IS NOT NULL;--> statement-breakpoint
INSERT INTO "invoice_number_events" ("action", "kind", "metadata", "number", "org_id", "source")
SELECT
	'migration_baseline',
	'invoice',
	jsonb_build_object(
		'creditNoteCounter', "next_credit_note_number",
		'creditNotePrefix', "credit_note_prefix",
		'digits', "invoice_digits",
		'invoiceCounter', "next_invoice_number",
		'invoicePrefix', "invoice_prefix",
		'separator', "invoice_separator"
	),
	"next_invoice_number"::text,
	"id",
	'system'
FROM "orgs";--> statement-breakpoint
CREATE INDEX "invoice_number_events_org_created_idx" ON "invoice_number_events" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "invoice_number_events_invoice_idx" ON "invoice_number_events" USING btree ("invoice_id");
