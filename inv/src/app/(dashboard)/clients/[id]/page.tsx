import { eq, desc } from "drizzle-orm";
import { notFound } from "next/navigation";

import { ClientDetailView } from "@/components/client-detail";
import { db } from "@/lib/db";
import { clients, invoices } from "@/lib/db/schema";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [client] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);

  if (!client) {
    notFound();
  }

  const clientInvoices = await db
    .select({
      currency: invoices.currency,
      dueAt: invoices.dueAt,
      id: invoices.id,
      issuedAt: invoices.issuedAt,
      number: invoices.number,
      status: invoices.status,
      total: invoices.total,
    })
    .from(invoices)
    .where(eq(invoices.clientId, id))
    .orderBy(desc(invoices.createdAt));

  return <ClientDetailView client={client} invoices={clientInvoices} />;
}
