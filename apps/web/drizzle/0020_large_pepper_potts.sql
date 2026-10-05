ALTER TABLE "invoices" ALTER COLUMN "subtotal" SET DATA TYPE numeric(19, 4);--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "tax_amount" SET DATA TYPE numeric(19, 4);--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "tax_rate" SET DATA TYPE numeric(9, 6);--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "total" SET DATA TYPE numeric(19, 4);--> statement-breakpoint
ALTER TABLE "line_items" ALTER COLUMN "amount" SET DATA TYPE numeric(19, 4);--> statement-breakpoint
ALTER TABLE "line_items" ALTER COLUMN "quantity" SET DATA TYPE numeric(18, 6);--> statement-breakpoint
ALTER TABLE "line_items" ALTER COLUMN "unit_price" SET DATA TYPE numeric(18, 6);--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "amount" SET DATA TYPE numeric(19, 4);