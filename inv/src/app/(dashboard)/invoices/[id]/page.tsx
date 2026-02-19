import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { InvoiceDetailView } from "@/components/invoice-detail";
import { db } from "@/lib/db";
import { clients, invoices, lineItems } from "@/lib/db/schema";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);

  if (!invoice) {
    notFound();
  }

  const [client] = await db
    .select({ email: clients.email, name: clients.name })
    .from(clients)
    .where(eq(clients.id, invoice.clientId))
    .limit(1);

  const items = await db
    .select()
    .from(lineItems)
    .where(eq(lineItems.invoiceId, id))
    .orderBy(asc(lineItems.sortOrder));

  return (
    <InvoiceDetailView
      invoice={{
        ...invoice,
        client: client ?? { email: "", name: "Unknown" },
        lineItems: items,
        status: invoice.status ?? "draft",
      }}
    />
  );
}
