ALTER TABLE "invoices" ADD COLUMN "document_locale" text;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "document_locale" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locale" text DEFAULT 'en' NOT NULL;--> statement-breakpoint

-- German and Austrian workspaces write German documents from now on, the same
-- country reading as 0023 and 0024: the stored ISO code first, the free-text
-- name when no code was ever stored. Everyone else keeps English and can
-- switch in Settings.
UPDATE "orgs" SET "document_locale" = 'de'
WHERE upper(btrim(coalesce("country_code", ''))) IN ('DE', 'AT')
   OR ("country_code" IS NULL AND lower(btrim(coalesce("country", ''))) IN ('germany', 'deutschland', 'de', 'austria', 'österreich', 'oesterreich', 'at'));--> statement-breakpoint

-- Documents issued before this migration were rendered in English. The snapshot
-- records that, so a workspace switching to German does not change what an
-- already issued invoice says. Drafts stay unset and follow the workspace.
UPDATE "invoices" SET "document_locale" = 'en' WHERE "status" <> 'draft' AND "document_locale" IS NULL;--> statement-breakpoint

-- Members of those workspaces most likely read German too. New accounts take the
-- browser language at sign-up; existing ones can switch in Settings.
UPDATE "users" SET "locale" = 'de'
WHERE "id" IN (
  SELECT m."user_id" FROM "org_members" m JOIN "orgs" o ON o."id" = m."org_id"
  WHERE o."document_locale" = 'de'
);
