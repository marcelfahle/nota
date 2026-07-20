import { and, desc, eq } from "drizzle-orm";
import { FileText, Plus } from "lucide-react";
import Link from "next/link";

import { InvoiceArchiveMenu } from "@/components/invoice-archive-menu";
import { InvoiceRowActions } from "@/components/invoice-row-actions";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { clients, invoices } from "@/lib/db/schema";
import { formatCurrency } from "@/lib/utils";

const FILTER_STATUSES = [
  "all",
  "draft",
  "sent",
  "paid",
  "overdue",
  "cancelled",
] as const;

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: filterStatus } = await searchParams;
  const { org, role } = await getCurrentUser();

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
      stripePaymentLinkUrl: invoices.stripePaymentLinkUrl,
      total: invoices.total,
    })
    .from(invoices)
    .leftJoin(
      clients,
      and(eq(invoices.clientId, clients.id), eq(clients.orgId, org.id)),
    )
    .where(eq(invoices.orgId, org.id))
    .orderBy(desc(invoices.issuedAt));

  let outstanding = 0;
  let totalPaid = 0;
  let overdueAmount = 0;
  let overdueCount = 0;
  const statusCounts = {
    cancelled: 0,
    draft: 0,
    overdue: 0,
    paid: 0,
    sent: 0,
  };

  for (const inv of invoiceList) {
    const amount = Number(inv.total ?? 0);
    const status = inv.status ?? "draft";
    statusCounts[status] += 1;
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

  const activeFilter =
    filterStatus &&
    FILTER_STATUSES.includes(filterStatus as (typeof FILTER_STATUSES)[number])
      ? filterStatus
      : "all";

  const filtered =
    activeFilter === "all"
      ? invoiceList
      : invoiceList.filter((inv) => inv.status === activeFilter);

  const filterCounts = { all: invoiceList.length, ...statusCounts };

  return (
    <div>
      <div className="mb-8 flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold tracking-tight">Invoices</h1>
        <InvoiceArchiveMenu
          status={activeFilter === "all" ? undefined : activeFilter}
        />
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-8">
        <StatCard label="Outstanding" value={formatCurrency(outstanding)} />
        <StatCard label="Total Paid" value={formatCurrency(totalPaid)} />
        <StatCard
          label="Overdue"
          sub={
            overdueCount > 0
              ? `${overdueCount} invoice${overdueCount === 1 ? "" : "s"}`
              : undefined
          }
          value={formatCurrency(overdueAmount)}
        />
      </div>

      <div className="mb-6 flex gap-1 overflow-x-auto">
        {FILTER_STATUSES.map((s) => (
          <Link
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeFilter === s
                ? "bg-zinc-100 text-zinc-900"
                : "text-zinc-500 hover:text-zinc-700"
            }`}
            href={s === "all" ? "/invoices" : `/invoices?status=${s}`}
            key={s}
          >
            <span>{s.charAt(0).toUpperCase() + s.slice(1)}</span>
            <span className="ml-1.5 text-xs text-zinc-400 tabular-nums">
              {filterCounts[s]}
            </span>
          </Link>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100">
            <FileText className="h-6 w-6 text-zinc-400" />
          </div>
          <p className="mb-1 text-sm font-medium text-zinc-900">
            {activeFilter === "all"
              ? "No invoices yet"
              : `No ${activeFilter} invoices`}
          </p>
          <p className="mb-4 text-sm text-zinc-500">
            {activeFilter === "all"
              ? "Create your first invoice to get started."
              : "Try another status or return to all invoices."}
          </p>
          {activeFilter === "all" ? (
            <Button asChild size="sm">
              <Link href="/invoices/new">
                <Plus />
                Create Invoice
              </Link>
            </Button>
          ) : (
            <Button asChild size="sm" variant="outline">
              <Link href="/invoices">View all invoices</Link>
            </Button>
          )}
        </div>
      ) : (
        <div>
          <div className="hidden grid-cols-[minmax(7rem,0.8fr)_minmax(12rem,1.5fr)_minmax(7rem,0.7fr)_minmax(6rem,0.6fr)_minmax(7.5rem,0.8fr)_auto] gap-4 border-b border-zinc-100 pb-3 text-xs font-medium tracking-wide text-zinc-400 uppercase md:grid">
            <span>Invoice</span>
            <span>Client</span>
            <span className="text-right">Amount</span>
            <span>Status</span>
            <span>Due</span>
            <span className="text-right">Actions</span>
          </div>
          <ul className="divide-y divide-zinc-100">
            {filtered.map((inv) => (
              <li
                className="group grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-3 py-4 md:grid-cols-[minmax(7rem,0.8fr)_minmax(12rem,1.5fr)_minmax(7rem,0.7fr)_minmax(6rem,0.6fr)_minmax(7.5rem,0.8fr)_auto] md:items-center md:gap-4"
                data-testid="invoice-list-row"
                key={inv.id}
              >
                <div className="min-w-0">
                  <Link
                    className="font-mono text-sm font-semibold text-zinc-900 underline-offset-4 group-hover:underline"
                    href={`/invoices/${inv.id}`}
                  >
                    {inv.number}
                  </Link>
                  <p className="mt-1 text-xs text-zinc-400">
                    Issued {formatDate(inv.issuedAt)}
                  </p>
                  <div className="mt-2 md:hidden">
                    <StatusBadge status={inv.status ?? "draft"} />
                  </div>
                </div>
                <div className="min-w-0 md:col-start-2 md:row-start-1">
                  <Link className="block min-w-0" href={`/invoices/${inv.id}`}>
                    <p className="truncate text-sm font-medium text-zinc-900">
                      {inv.clientName}
                    </p>
                    <p className="truncate text-xs text-zinc-500">
                      {inv.clientEmail}
                    </p>
                  </Link>
                </div>
                <div className="col-start-2 row-start-1 text-right md:col-start-3">
                  <Link
                    className="text-sm font-semibold text-zinc-900 tabular-nums"
                    href={`/invoices/${inv.id}`}
                  >
                    {formatCurrency(
                      Number(inv.total ?? 0),
                      inv.currency ?? "EUR",
                    )}
                  </Link>
                </div>
                <div className="hidden md:col-start-4 md:block">
                  <Link className="inline-flex" href={`/invoices/${inv.id}`}>
                    <StatusBadge status={inv.status ?? "draft"} />
                  </Link>
                </div>
                <div className="text-sm text-zinc-500 md:col-start-5">
                  <Link href={`/invoices/${inv.id}`}>
                    <span className="md:hidden">Due </span>
                    <span
                      className={
                        inv.status === "overdue"
                          ? "font-medium text-red-700"
                          : ""
                      }
                    >
                      {formatDate(inv.dueAt)}
                    </span>
                  </Link>
                </div>
                <div className="col-span-2 md:col-span-1 md:col-start-6">
                  <InvoiceRowActions
                    invoice={{
                      id: inv.id,
                      number: inv.number,
                      status: inv.status,
                      stripePaymentLinkUrl: inv.stripePaymentLinkUrl,
                    }}
                    role={role}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
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
