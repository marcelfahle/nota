-- 1. Add invoice numbering columns to users
ALTER TABLE "users" ADD COLUMN "invoice_separator" text NOT NULL DEFAULT '-';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "invoice_digits" integer NOT NULL DEFAULT 4;--> statement-breakpoint

-- 2. Create bank_accounts table
CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"details" text NOT NULL,
	"is_default" boolean NOT NULL DEFAULT false,
	"sort_order" integer NOT NULL DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- 3. Migrate existing bank_details to bank_accounts
INSERT INTO "bank_accounts" ("user_id", "name", "details", "is_default")
SELECT "id", 'Primary', "bank_details", true FROM "users" WHERE "bank_details" IS NOT NULL AND "bank_details" != '';--> statement-breakpoint

-- 4. Drop legacy bank_details column
ALTER TABLE "users" DROP COLUMN "bank_details";--> statement-breakpoint

-- 5. Add bank_account_id to clients
ALTER TABLE "clients" ADD COLUMN "bank_account_id" uuid;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE set null ON UPDATE no action;
