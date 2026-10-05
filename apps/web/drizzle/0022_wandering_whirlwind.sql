ALTER TABLE "clients" ADD COLUMN "tax_identifier_canonical_value" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "tax_identifier_country_code" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "tax_identifier_type" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "tax_identifier_value" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "client_tax_identifier" jsonb;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "seller_tax_identifier" jsonb;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "tax_identifier_canonical_value" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "tax_identifier_country_code" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "tax_identifier_type" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "tax_identifier_value" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tax_identifier_canonical_value" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tax_identifier_country_code" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tax_identifier_type" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tax_identifier_value" text;--> statement-breakpoint

-- Legacy values with an unmistakable VIES prefix remain EU VAT IDs. Everything
-- else is preserved verbatim as a neutral tax ID; migration never guesses EIN.
UPDATE "orgs" SET
  "tax_identifier_value" = "vat_number",
  "tax_identifier_canonical_value" = upper(regexp_replace("vat_number", '[^A-Za-z0-9]', '', 'g')),
  "tax_identifier_type" = CASE
    WHEN left(upper(regexp_replace("vat_number", '[^A-Za-z0-9]', '', 'g')), 2) IN
      ('AT','BE','BG','CY','CZ','DE','DK','EE','EL','ES','FI','FR','HR','HU','IE','IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK','XI')
    THEN 'eu_vat' ELSE 'tax_id' END,
  "tax_identifier_country_code" = CASE
    WHEN left(upper(regexp_replace("vat_number", '[^A-Za-z0-9]', '', 'g')), 2) IN
      ('AT','BE','BG','CY','CZ','DE','DK','EE','EL','ES','FI','FR','HR','HU','IE','IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK','XI')
    THEN left(upper(regexp_replace("vat_number", '[^A-Za-z0-9]', '', 'g')), 2) ELSE NULL END
WHERE "vat_number" IS NOT NULL AND btrim("vat_number") <> '';--> statement-breakpoint

UPDATE "clients" SET
  "tax_identifier_value" = "vat_number",
  "tax_identifier_canonical_value" = upper(regexp_replace("vat_number", '[^A-Za-z0-9]', '', 'g')),
  "tax_identifier_type" = CASE
    WHEN left(upper(regexp_replace("vat_number", '[^A-Za-z0-9]', '', 'g')), 2) IN
      ('AT','BE','BG','CY','CZ','DE','DK','EE','EL','ES','FI','FR','HR','HU','IE','IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK','XI')
    THEN 'eu_vat' ELSE 'tax_id' END,
  "tax_identifier_country_code" = CASE
    WHEN left(upper(regexp_replace("vat_number", '[^A-Za-z0-9]', '', 'g')), 2) IN
      ('AT','BE','BG','CY','CZ','DE','DK','EE','EL','ES','FI','FR','HR','HU','IE','IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK','XI')
    THEN left(upper(regexp_replace("vat_number", '[^A-Za-z0-9]', '', 'g')), 2) ELSE NULL END
WHERE "vat_number" IS NOT NULL AND btrim("vat_number") <> '';--> statement-breakpoint

UPDATE "users" SET
  "tax_identifier_value" = "vat_number",
  "tax_identifier_canonical_value" = upper(regexp_replace("vat_number", '[^A-Za-z0-9]', '', 'g')),
  "tax_identifier_type" = CASE
    WHEN left(upper(regexp_replace("vat_number", '[^A-Za-z0-9]', '', 'g')), 2) IN
      ('AT','BE','BG','CY','CZ','DE','DK','EE','EL','ES','FI','FR','HR','HU','IE','IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK','XI')
    THEN 'eu_vat' ELSE 'tax_id' END,
  "tax_identifier_country_code" = CASE
    WHEN left(upper(regexp_replace("vat_number", '[^A-Za-z0-9]', '', 'g')), 2) IN
      ('AT','BE','BG','CY','CZ','DE','DK','EE','EL','ES','FI','FR','HR','HU','IE','IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK','XI')
    THEN left(upper(regexp_replace("vat_number", '[^A-Za-z0-9]', '', 'g')), 2) ELSE NULL END
WHERE "vat_number" IS NOT NULL AND btrim("vat_number") <> '';--> statement-breakpoint

-- Freeze the tax-identifier portion of every already-issued original at the
-- migration boundary. Drafts take their snapshot in the issuance transaction.
UPDATE "invoices" AS i SET
  "seller_tax_identifier" = CASE WHEN o."tax_identifier_value" IS NULL THEN NULL ELSE jsonb_build_object(
    'type', o."tax_identifier_type", 'value', o."tax_identifier_value",
    'canonicalValue', o."tax_identifier_canonical_value", 'countryCode', o."tax_identifier_country_code") END,
  "client_tax_identifier" = CASE WHEN c."tax_identifier_value" IS NULL THEN NULL ELSE jsonb_build_object(
    'type', c."tax_identifier_type", 'value', c."tax_identifier_value",
    'canonicalValue', c."tax_identifier_canonical_value", 'countryCode', c."tax_identifier_country_code") END
FROM "orgs" o, "clients" c
WHERE i."org_id" = o."id" AND i."client_id" = c."id" AND i."status" <> 'draft';
