import { asc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { createInvoice } from "@/actions/invoices";
import { InvoiceForm } from "@/components/invoice-form";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";

export default async function NewInvoicePage() {
  const user = await getCurrentUser();

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

  return (
    <div>
      <Link
        className="mb-6 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"
        href="/invoices"
      >
        <ArrowLeft className="size-4" />
        Back to invoices
      </Link>

      <h1 className="mb-6 text-lg font-semibold">New Invoice</h1>

      <div className="max-w-3xl">
        <InvoiceForm action={createInvoice} clients={clientList} />
      </div>
    </div>
  );
}
