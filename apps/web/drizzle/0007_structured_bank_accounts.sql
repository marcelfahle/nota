ALTER TABLE "bank_accounts" ADD COLUMN "account_type" text DEFAULT 'freeform' NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD COLUMN "bic" text;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD COLUMN "iban" text;--> statement-breakpoint

-- Backfill: extract IBAN from details where possible
UPDATE "bank_accounts"
SET "account_type" = 'iban',
    "iban" = regexp_replace(upper(substring("details" from '([A-Za-z]{2}\d{2}[\s]?[\dA-Za-z]{4,30})')), '\s', '', 'g')
WHERE "details" ~* '\b[A-Z]{2}\d{2}[\s]?[\dA-Z]{4,30}\b';
