import { asc, eq, sql } from "drizzle-orm";
import { Plus } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { clients, invoices } from "@/lib/db/schema";
import { formatCurrency } from "@/lib/utils";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default async function ClientsPage() {
  const clientList = await db
    .select({
      company: clients.company,
      email: clients.email,
      id: clients.id,
      invoiceCount: sql<number>`count(${invoices.id})::int`,
      name: clients.name,
      totalInvoiced: sql<string>`coalesce(sum(${invoices.total}::numeric), 0)`,
    })
    .from(clients)
    .leftJoin(invoices, eq(clients.id, invoices.clientId))
    .groupBy(clients.id)
    .orderBy(asc(clients.name));

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Clients</h1>
        <Button asChild size="sm">
          <Link href="/clients/new">
            <Plus />
            New Client
          </Link>
        </Button>
      </div>

      {clientList.length === 0 ? (
        <p className="text-sm text-zinc-400">No clients yet.</p>
      ) : (
        <div className="divide-y divide-zinc-100">
          {clientList.map((client) => (
            <Link
              className="-mx-4 flex items-center justify-between rounded-lg px-4 py-4 transition-colors hover:bg-zinc-50"
              href={`/clients/${client.id}`}
              key={client.id}
            >
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-sm font-medium text-zinc-600">
                  {getInitials(client.name)}
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-900">{client.name}</p>
                  <p className="text-xs text-zinc-500">{client.email}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-zinc-900">
                  {formatCurrency(Number(client.totalInvoiced))}
                </p>
                <p className="text-xs text-zinc-500">
                  {client.invoiceCount} {client.invoiceCount === 1 ? "invoice" : "invoices"}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
