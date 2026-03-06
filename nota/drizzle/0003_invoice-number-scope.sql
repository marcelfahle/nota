ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_number_unique";--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_number_unique" UNIQUE ("user_id","number");
