import { and, asc, eq, gte, lte } from "drizzle-orm";

import { db } from "@/lib/db";
import { clients, invoices } from "@/lib/db/schema";
import type { InvoiceLifecycleStatus } from "@/lib/invoice-lifecycle";
import type { InvoicePeriod } from "@/lib/invoice-period";

export const MAX_INVOICE_ARCHIVE_SIZE = 100;

export type InvoiceExportFilters = {
  clientId?: string | null;
  period: InvoicePeriod;
  status?: InvoiceLifecycleStatus | null;
};

export async function listInvoicesForExport(
  orgId: string,
  filters: InvoiceExportFilters,
) {
  const clauses = [eq(invoices.orgId, orgId)];
  if (filters.period.from) {
    clauses.push(gte(invoices.issuedAt, filters.period.from));
  }
  if (filters.period.to) {
    clauses.push(lte(invoices.issuedAt, filters.period.to));
  }
  if (filters.status) {
    clauses.push(eq(invoices.status, filters.status));
  }
  if (filters.clientId) {
    clauses.push(eq(invoices.clientId, filters.clientId));
  }

  return db
    .select({
      clientName: clients.name,
      id: invoices.id,
      issuedAt: invoices.issuedAt,
      number: invoices.number,
    })
    .from(invoices)
    .leftJoin(
      clients,
      and(eq(clients.id, invoices.clientId), eq(clients.orgId, orgId)),
    )
    .where(and(...clauses))
    .orderBy(asc(invoices.issuedAt), asc(invoices.number))
    .limit(MAX_INVOICE_ARCHIVE_SIZE + 1);
}
