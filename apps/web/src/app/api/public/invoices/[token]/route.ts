import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { activityLog, invoices } from "@/lib/db/schema";
import { getInvoiceDetail } from "@/lib/invoice-service";

const VIEW_DEDUPE_MS = 30 * 60 * 1000;

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invoiceId = await db.transaction(async (tx) => {
    const [invoice] = await tx
      .select({ id: invoices.id, orgId: invoices.orgId, status: invoices.status })
      .from(invoices)
      .where(eq(invoices.publicToken, token))
      .for("update");
    if (!invoice?.orgId || invoice.status === "draft") {
      return null;
    }
    const [latest] = await tx
      .select({ createdAt: activityLog.createdAt })
      .from(activityLog)
      .where(and(eq(activityLog.invoiceId, invoice.id), eq(activityLog.action, "viewed")))
      .orderBy(desc(activityLog.createdAt))
      .limit(1);
    if (!latest?.createdAt || Date.now() - latest.createdAt.getTime() >= VIEW_DEDUPE_MS) {
      await tx.insert(activityLog).values({
        action: "viewed",
        invoiceId: invoice.id,
        metadata: { viewedAt: new Date().toISOString().slice(0, 16) },
        source: "system",
      });
    }
    return { id: invoice.id, orgId: invoice.orgId };
  });
  if (!invoiceId) {
    return Response.json({ error: "Invoice not found" }, { status: 404 });
  }
  const invoice = await getInvoiceDetail(invoiceId.orgId, invoiceId.id);
  if (!invoice) {
    return Response.json({ error: "Invoice not found" }, { status: 404 });
  }
  return Response.json(
    {
      data: {
        balance: invoice.balance,
        client: invoice.client,
        creditedAmount: invoice.creditedAmount,
        currency: invoice.currency,
        dueAt: invoice.dueAt,
        issuedAt: invoice.issuedAt,
        kind: invoice.kind,
        lastViewedAt: invoice.lastViewedAt,
        lineItems: invoice.lineItems,
        notes: invoice.notes,
        number: invoice.number,
        paidAmount: invoice.paidAmount,
        settlementStatus: invoice.settlementStatus,
        status: invoice.status,
        total: invoice.total,
        viewCount: invoice.viewCount,
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
