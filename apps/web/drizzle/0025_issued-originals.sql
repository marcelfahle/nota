CREATE TABLE "invoice_documents" (
	"byte_size" integer NOT NULL,
	"content_type" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"filename" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"org_id" uuid NOT NULL,
	"sha256" text NOT NULL,
	"storage_key" text NOT NULL,
	CONSTRAINT "invoice_documents_invoice_id_kind_unique" UNIQUE("invoice_id","kind")
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "issued_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "invoice_documents" ADD CONSTRAINT "invoice_documents_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_documents" ADD CONSTRAINT "invoice_documents_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;