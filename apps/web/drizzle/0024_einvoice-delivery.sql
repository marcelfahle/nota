ALTER TABLE "orgs" ADD COLUMN "e_invoice_delivery" text DEFAULT 'pdf_only' NOT NULL;--> statement-breakpoint

-- Existing German workspaces get the XML attached by default, matching what a
-- new German workspace would start with. Everyone else stays PDF only and can
-- turn it on in Settings. The same country reading as 0023: the stored ISO
-- code first, the free-text name when no code was ever stored.
UPDATE "orgs" SET "e_invoice_delivery" = 'pdf_and_xrechnung'
WHERE upper(btrim(coalesce("country_code", ''))) = 'DE'
   OR ("country_code" IS NULL AND lower(btrim(coalesce("country", ''))) IN ('germany', 'deutschland', 'de'));
