import { notFound } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients, invoices } from "@/lib/db/schema";
import { ClientDetailView } from "@/components/client-detail";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, id))
    .limit(1);

  if (!client) notFound();

  const clientInvoices = await db
    .select({
      id: invoices.id,
      number: invoices.number,
      status: invoices.status,
      total: invoices.total,
      currency: invoices.currency,
      issuedAt: invoices.issuedAt,
      dueAt: invoices.dueAt,
    })
    .from(invoices)
    .where(eq(invoices.clientId, id))
    .orderBy(desc(invoices.createdAt));

  return <ClientDetailView client={client} invoices={clientInvoices} />;
}
