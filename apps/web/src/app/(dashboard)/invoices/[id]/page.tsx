import { and, asc, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { InvoiceDetailView } from "@/components/invoice-detail";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { activityLog, clients, invoices, lineItems } from "@/lib/db/schema";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { org } = await getCurrentUser();

  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.orgId, org.id)))
    .limit(1);

  if (!invoice) {
    notFound();
  }

  const [client] = await db
    .select({ email: clients.email, name: clients.name })
    .from(clients)
    .where(and(eq(clients.id, invoice.clientId), eq(clients.orgId, org.id)))
    .limit(1);

  const items = await db
    .select()
    .from(lineItems)
    .where(eq(lineItems.invoiceId, id))
    .orderBy(asc(lineItems.sortOrder));

  const activities = await db
    .select()
    .from(activityLog)
    .where(eq(activityLog.invoiceId, id))
    .orderBy(desc(activityLog.createdAt));

  return (
    <InvoiceDetailView
      activities={activities.map((a) => ({
        action: a.action,
        createdAt: a.createdAt?.toISOString() ?? "",
        id: a.id,
      }))}
      invoice={{
        ...invoice,
        client: client ?? { email: "", name: "Unknown" },
        lineItems: items,
        status: invoice.status ?? "draft",
      }}
    />
  );
}
