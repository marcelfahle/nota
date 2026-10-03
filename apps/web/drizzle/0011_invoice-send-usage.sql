CREATE INDEX "invoice_sends_org_month_idx" ON "invoice_sends" USING btree ("org_id","month");--> statement-breakpoint
INSERT INTO "invoice_sends" ("invoice_id", "org_id", "month")
SELECT i.id, i.org_id, date_trunc('month', COALESCE(i.sent_at, MIN(a.created_at)))::date
FROM invoices i JOIN activity_log a ON a.invoice_id = i.id AND a.action = 'sent'
WHERE i.org_id IS NOT NULL
GROUP BY i.id, i.org_id, i.sent_at
ON CONFLICT (invoice_id) DO NOTHING;
