import { and, asc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { updateInvoice } from "@/actions/invoices";
import { InvoiceForm } from "@/components/invoice-form";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { clients, invoices, lineItems } from "@/lib/db/schema";

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();

  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.userId, user.id)))
    .limit(1);

  if (!invoice) {
    notFound();
  }

  if (invoice.status !== "draft") {
    notFound();
  }

  const clientList = await db
    .select({
      defaultCurrency: clients.defaultCurrency,
      email: clients.email,
      id: clients.id,
      name: clients.name,
    })
    .from(clients)
    .where(eq(clients.userId, user.id))
    .orderBy(asc(clients.name));

  const items = await db
    .select()
    .from(lineItems)
    .where(eq(lineItems.invoiceId, id))
    .orderBy(asc(lineItems.sortOrder));

  const boundUpdateAction = updateInvoice.bind(null, id);

  return (
    <div>
      <Link
        className="mb-6 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"
        href={`/invoices/${id}`}
      >
        <ArrowLeft className="size-4" />
        Back to invoice
      </Link>

      <h1 className="mb-6 text-lg font-semibold">Edit {invoice.number}</h1>

      <div className="max-w-3xl">
        <InvoiceForm
          action={boundUpdateAction}
          clients={clientList}
          defaultValues={{
            clientId: invoice.clientId,
            currency: invoice.currency ?? "EUR",
            dueAt: invoice.dueAt,
            internalNotes: invoice.internalNotes,
            issuedAt: invoice.issuedAt,
            lineItems: items.map((item) => ({
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
            })),
            notes: invoice.notes,
            reverseCharge: invoice.reverseCharge ?? "false",
            taxRate: invoice.taxRate ?? "0",
          }}
          redirectTo={`/invoices/${id}`}
          submitLabel="Update Invoice"
        />
      </div>
    </div>
  );
}
