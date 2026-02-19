import Link from "next/link";
import { asc } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { createInvoice } from "@/actions/invoices";
import { InvoiceForm } from "@/components/invoice-form";

export default async function NewInvoicePage() {
  const clientList = await db
    .select({
      id: clients.id,
      name: clients.name,
      email: clients.email,
      defaultCurrency: clients.defaultCurrency,
    })
    .from(clients)
    .orderBy(asc(clients.name));

  return (
    <div>
      <Link
        href="/invoices"
        className="mb-6 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"
      >
        <ArrowLeft className="size-4" />
        Back to invoices
      </Link>

      <h1 className="mb-6 text-lg font-semibold">New Invoice</h1>

      <div className="max-w-3xl">
        <InvoiceForm clients={clientList} action={createInvoice} />
      </div>
    </div>
  );
}
