import { and, asc, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { ClientDetailView } from "@/components/client-detail";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { bankAccounts, clients, invoices } from "@/lib/db/schema";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();

  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, id), eq(clients.userId, user.id)))
    .limit(1);

  if (!client) {
    notFound();
  }

  const [clientInvoices, userBankAccounts] = await Promise.all([
    db
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
      .where(and(eq(invoices.clientId, id), eq(invoices.userId, user.id)))
      .orderBy(desc(invoices.createdAt)),
    db
      .select({
        id: bankAccounts.id,
        isDefault: bankAccounts.isDefault,
        name: bankAccounts.name,
      })
      .from(bankAccounts)
      .where(eq(bankAccounts.userId, user.id))
      .orderBy(asc(bankAccounts.sortOrder), asc(bankAccounts.createdAt)),
  ]);

  return (
    <ClientDetailView bankAccounts={userBankAccounts} client={client} invoices={clientInvoices} />
  );
}
