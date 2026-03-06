CREATE TYPE "public"."org_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TABLE "orgs" (
	"business_address" text,
	"business_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"default_currency" text DEFAULT 'EUR' NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_digits" integer DEFAULT 4 NOT NULL,
	"invoice_prefix" text DEFAULT 'INV' NOT NULL,
	"invoice_separator" text DEFAULT '-' NOT NULL,
	"logo_url" text,
	"name" text NOT NULL,
	"next_invoice_number" integer DEFAULT 1 NOT NULL,
	"stripe_customer_id" text,
	"vat_number" text
);--> statement-breakpoint
CREATE TABLE "org_members" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"role" "org_role" DEFAULT 'member' NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "org_members_org_id_user_id_unique" UNIQUE("org_id","user_id")
);--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD COLUMN "org_id" uuid;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "org_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "org_id" uuid;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_user_id_number_unique";--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_org_id_number_unique" UNIQUE("org_id","number");
