CREATE TYPE "public"."tax_treatment" AS ENUM('standard', 'zero_rated', 'exempt_small_business', 'reverse_charge');--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "country_code" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "default_buyer_reference" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "postal_code" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "public_sector" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "street" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "buyer_reference" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "service_period_end" date;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "service_period_start" date;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "tax_treatment" "tax_treatment" DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "contact_name" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "contact_phone" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "country_code" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "default_tax_treatment" "tax_treatment" DEFAULT 'standard' NOT NULL;--> statement-breakpoint

-- Existing documents only carried a reverse-charge flag and a rate. Reverse
-- charge stays reverse charge; a stated 0% rate becomes zero-rated because that
-- is what the document said. A rate that was never entered stays standard, and
-- a Kleinunternehmer exemption is never inferred. Rows that stay standard are
-- not rewritten.
UPDATE "invoices" SET "tax_treatment" = CASE
  WHEN "reverse_charge" = 'true' THEN 'reverse_charge'::"tax_treatment"
  ELSE 'zero_rated'::"tax_treatment" END
WHERE "reverse_charge" = 'true' OR "tax_rate" = 0;--> statement-breakpoint

-- One-time best-effort read of the free-text country. The text itself is kept.
-- Names are matched first so "UK" becomes GB; bare codes must be real ISO codes.
UPDATE "orgs" SET "country_code" = CASE
  WHEN lower(btrim("country")) IN ('germany', 'deutschland') THEN 'DE'
  WHEN lower(btrim("country")) IN ('austria', 'österreich', 'oesterreich') THEN 'AT'
  WHEN lower(btrim("country")) IN ('switzerland', 'schweiz', 'suisse', 'svizzera') THEN 'CH'
  WHEN lower(btrim("country")) IN ('spain', 'españa', 'espana') THEN 'ES'
  WHEN lower(btrim("country")) IN ('france') THEN 'FR'
  WHEN lower(btrim("country")) IN ('italy', 'italia') THEN 'IT'
  WHEN lower(btrim("country")) IN ('netherlands', 'the netherlands', 'nederland') THEN 'NL'
  WHEN lower(btrim("country")) IN ('belgium', 'belgië', 'belgique') THEN 'BE'
  WHEN lower(btrim("country")) IN ('luxembourg', 'luxemburg') THEN 'LU'
  WHEN lower(btrim("country")) IN ('portugal') THEN 'PT'
  WHEN lower(btrim("country")) IN ('ireland') THEN 'IE'
  WHEN lower(btrim("country")) IN ('poland', 'polska') THEN 'PL'
  WHEN lower(btrim("country")) IN ('czechia', 'czech republic') THEN 'CZ'
  WHEN lower(btrim("country")) IN ('denmark', 'danmark') THEN 'DK'
  WHEN lower(btrim("country")) IN ('sweden', 'sverige') THEN 'SE'
  WHEN lower(btrim("country")) IN ('norway', 'norge') THEN 'NO'
  WHEN lower(btrim("country")) IN ('finland', 'suomi') THEN 'FI'
  WHEN lower(btrim("country")) IN ('united kingdom', 'uk', 'great britain', 'england') THEN 'GB'
  WHEN lower(btrim("country")) IN ('united states', 'united states of america', 'usa') THEN 'US'
  WHEN upper(btrim("country")) IN ('AT','BE','BG','CH','CY','CZ','DE','DK','EE','ES','FI','FR','GB','GR','HR','HU','IE','IT','LI','LT','LU','LV','MT','NL','NO','PL','PT','RO','SE','SI','SK','US')
    THEN upper(btrim("country"))
  ELSE NULL END
WHERE "country_code" IS NULL AND "country" IS NOT NULL AND btrim("country") <> '';--> statement-breakpoint

-- Seller contact (BR-DE-2) defaults to the first workspace owner. Only fills gaps.
UPDATE "orgs" o SET
  "contact_name" = coalesce(o."contact_name", u."name"),
  "contact_email" = coalesce(o."contact_email", u."email")
FROM (
  SELECT DISTINCT ON ("org_id") "org_id", "user_id"
  FROM "org_members" WHERE "role" = 'owner' ORDER BY "org_id", "created_at", "id"
) m JOIN "users" u ON u."id" = m."user_id"
WHERE m."org_id" = o."id"
  AND (o."contact_name" IS NULL OR o."contact_email" IS NULL);--> statement-breakpoint

-- One-time best-effort split of "Street, 12345 City, Country" or the same on
-- three lines. Anything else stays free text until someone edits the client.
WITH parsed AS (
  SELECT "id",
    regexp_match("address", '^\s*([^,\n]+?)\s*[,\n]\s*(\d{4,6})\s+([^,\n]+?)(?:\s*[,\n]\s*([^,\n]+?))?\s*$') AS parts
  FROM "clients"
  WHERE "address" IS NOT NULL AND "street" IS NULL AND "city" IS NULL
)
UPDATE "clients" c SET
  "street" = parts[1],
  "postal_code" = parts[2],
  "city" = parts[3],
  "country_code" = CASE WHEN parts[4] IS NULL THEN NULL ELSE CASE
    WHEN lower(btrim(parts[4])) IN ('germany', 'deutschland') THEN 'DE'
    WHEN lower(btrim(parts[4])) IN ('austria', 'österreich', 'oesterreich') THEN 'AT'
    WHEN lower(btrim(parts[4])) IN ('switzerland', 'schweiz', 'suisse', 'svizzera') THEN 'CH'
    WHEN lower(btrim(parts[4])) IN ('spain', 'españa', 'espana') THEN 'ES'
    WHEN lower(btrim(parts[4])) IN ('france') THEN 'FR'
    WHEN lower(btrim(parts[4])) IN ('italy', 'italia') THEN 'IT'
    WHEN lower(btrim(parts[4])) IN ('netherlands', 'the netherlands', 'nederland') THEN 'NL'
    WHEN lower(btrim(parts[4])) IN ('belgium', 'belgië', 'belgique') THEN 'BE'
    WHEN lower(btrim(parts[4])) IN ('luxembourg', 'luxemburg') THEN 'LU'
    WHEN lower(btrim(parts[4])) IN ('portugal') THEN 'PT'
    WHEN lower(btrim(parts[4])) IN ('ireland') THEN 'IE'
    WHEN lower(btrim(parts[4])) IN ('poland', 'polska') THEN 'PL'
    WHEN lower(btrim(parts[4])) IN ('czechia', 'czech republic') THEN 'CZ'
    WHEN lower(btrim(parts[4])) IN ('denmark', 'danmark') THEN 'DK'
    WHEN lower(btrim(parts[4])) IN ('sweden', 'sverige') THEN 'SE'
    WHEN lower(btrim(parts[4])) IN ('norway', 'norge') THEN 'NO'
    WHEN lower(btrim(parts[4])) IN ('finland', 'suomi') THEN 'FI'
    WHEN lower(btrim(parts[4])) IN ('united kingdom', 'uk', 'great britain', 'england') THEN 'GB'
    WHEN lower(btrim(parts[4])) IN ('united states', 'united states of america', 'usa') THEN 'US'
    WHEN upper(btrim(parts[4])) IN ('AT','BE','BG','CH','CY','CZ','DE','DK','EE','ES','FI','FR','GB','GR','HR','HU','IE','IT','LI','LT','LU','LV','MT','NL','NO','PL','PT','RO','SE','SI','SK','US')
      THEN upper(btrim(parts[4]))
    ELSE NULL END END
FROM parsed
WHERE parsed."id" = c."id" AND parsed.parts IS NOT NULL;
