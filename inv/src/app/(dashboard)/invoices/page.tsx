import { desc, eq } from "drizzle-orm";
import { FileText, Plus } from "lucide-react";
import Link from "next/link";

import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { clients, invoices } from "@/lib/db/schema";
import { formatCurrency } from "@/lib/utils";

const FILTER_STATUSES = ["all", "draft", "sent", "paid", "overdue"] as const;

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: filterStatus } = await searchParams;

  const invoiceList = await db
    .select({
      clientEmail: clients.email,
      clientName: clients.name,
      currency: invoices.currency,
      dueAt: invoices.dueAt,
      id: invoices.id,
      issuedAt: invoices.issuedAt,
      number: invoices.number,
      status: invoices.status,
      total: invoices.total,
    })
    .from(invoices)
    .leftJoin(clients, eq(invoices.clientId, clients.id))
    .orderBy(desc(invoices.issuedAt));

  // Compute stats from all invoices (unfiltered)
  let outstanding = 0;
  let totalPaid = 0;
  let overdueAmount = 0;
  let overdueCount = 0;

  for (const inv of invoiceList) {
    const amount = Number(inv.total ?? 0);
    if (inv.status === "sent" || inv.status === "overdue") {
      outstanding += amount;
    }
    if (inv.status === "paid") {
      totalPaid += amount;
    }
    if (inv.status === "overdue") {
      overdueAmount += amount;
      overdueCount++;
    }
  }

  // Filter invoices by status tab
  const activeFilter =
    filterStatus && FILTER_STATUSES.includes(filterStatus as (typeof FILTER_STATUSES)[number])
      ? filterStatus
      : "all";

  const filtered =
    activeFilter === "all" ? invoiceList : invoiceList.filter((inv) => inv.status === activeFilter);

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Invoices</h1>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-3 gap-8">
        <StatCard label="Outstanding" value={formatCurrency(outstanding)} />
        <StatCard label="Total Paid" value={formatCurrency(totalPaid)} />
        <StatCard
          label="Overdue"
          sub={
            overdueCount > 0 ? `${overdueCount} invoice${overdueCount === 1 ? "" : "s"}` : undefined
          }
          value={formatCurrency(overdueAmount)}
        />
      </div>

      {/* Filter Tabs */}
      <div className="mb-6 flex gap-1">
        {FILTER_STATUSES.map((s) => (
          <Link
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeFilter === s ? "bg-zinc-100 text-zinc-900" : "text-zinc-500 hover:text-zinc-700"
            }`}
            href={s === "all" ? "/invoices" : `/invoices?status=${s}`}
            key={s}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </Link>
        ))}
      </div>

      {/* Invoice Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100">
            <FileText className="h-6 w-6 text-zinc-400" />
          </div>
          <p className="mb-1 text-sm font-medium text-zinc-900">No invoices yet</p>
          <p className="mb-4 text-sm text-zinc-500">Create your first invoice to get started.</p>
          <Button asChild size="sm">
            <Link href="/invoices/new">
              <Plus />
              Create Invoice
            </Link>
          </Button>
        </div>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-100 text-left text-xs font-medium tracking-wide text-zinc-400 uppercase">
              <th className="pr-4 pb-3">Number</th>
              <th className="pr-4 pb-3">Client</th>
              <th className="pr-4 pb-3 text-right">Amount</th>
              <th className="pr-4 pb-3">Status</th>
              <th className="pr-4 pb-3">Issued</th>
              <th className="pb-3">Due</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {filtered.map((inv) => (
              <tr className="group" key={inv.id}>
                <td className="py-3 pr-4">
                  <Link
                    className="font-mono text-sm font-medium text-zinc-900 group-hover:text-zinc-600"
                    href={`/invoices/${inv.id}`}
                  >
                    {inv.number}
                  </Link>
                </td>
                <td className="py-3 pr-4">
                  <Link className="block" href={`/invoices/${inv.id}`}>
                    <p className="text-sm text-zinc-900">{inv.clientName}</p>
                    <p className="text-xs text-zinc-500">{inv.clientEmail}</p>
                  </Link>
                </td>
                <td className="py-3 pr-4 text-right text-sm font-semibold text-zinc-900">
                  <Link href={`/invoices/${inv.id}`}>
                    {formatCurrency(Number(inv.total ?? 0), inv.currency ?? "EUR")}
                  </Link>
                </td>
                <td className="py-3 pr-4">
                  <Link href={`/invoices/${inv.id}`}>
                    <StatusBadge status={inv.status ?? "draft"} />
                  </Link>
                </td>
                <td className="py-3 pr-4 text-sm text-zinc-500">
                  <Link href={`/invoices/${inv.id}`}>{formatDate(inv.issuedAt)}</Link>
                </td>
                <td className="py-3 text-sm text-zinc-500">
                  <Link href={`/invoices/${inv.id}`}>{formatDate(inv.dueAt)}</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
