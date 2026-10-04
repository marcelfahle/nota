import { and, desc, eq, sql } from "drizzle-orm";
import { FileText, Plus } from "lucide-react";
import Link from "next/link";

import { InvoiceArchiveMenu } from "@/components/invoice-archive-menu";
import { InvoiceRowActions } from "@/components/invoice-row-actions";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { clients, invoices } from "@/lib/db/schema";
import {
  formatInvoiceDueDate,
  getInvoiceListStatus,
  matchesInvoiceSearch,
} from "@/lib/invoice-list";
import { formatCurrency } from "@/lib/utils";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "open", label: "Open" },
  { key: "overdue", label: "Overdue" },
  { key: "paid", label: "Paid" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; status?: string | string[] }>;
}) {
  const params = await searchParams;
  const filterStatus = first(params.status);
  const query = first(params.q)?.trim() ?? "";
  const { org, role } = await getCurrentUser();

  const invoiceList = await db
    .select({
      balance: sql<string>`greatest(coalesce(${invoices.total}::numeric, 0) - coalesce((select sum(p.amount) from payments p where p.invoice_id = ${invoices.id}), 0) - abs(coalesce((select sum(c.total::numeric) from invoices c where c.credits_invoice_id = ${invoices.id} and c.kind = 'credit_note' and c.status in ('sent', 'overdue', 'paid')), 0)), 0)`,
      clientName: clients.name,
      currency: invoices.currency,
      dueAt: invoices.dueAt,
      id: invoices.id,
      issuedAt: invoices.issuedAt,
      number: invoices.number,
      openCount: sql<number>`(select count(*)::int from activity_log a where a.invoice_id = ${invoices.id} and a.action = 'viewed')`,
      paidAmount: sql<string>`coalesce((select sum(p.amount) from payments p where p.invoice_id = ${invoices.id}), 0)`,
      source: invoices.source,
      sourceClient: invoices.sourceClient,
      status: invoices.status,
      stripePaymentLinkUrl: invoices.stripePaymentLinkUrl,
      total: invoices.total,
    })
    .from(invoices)
    .leftJoin(clients, and(eq(invoices.clientId, clients.id), eq(clients.orgId, org.id)))
    .where(eq(invoices.orgId, org.id))
    .orderBy(desc(invoices.issuedAt), desc(invoices.createdAt));

  const activeFilter = FILTERS.some(({ key }) => key === filterStatus)
    ? (filterStatus as FilterKey)
    : "all";
  const statusCounts: Record<FilterKey, number> = {
    all: invoiceList.length,
    draft: 0,
    open: 0,
    overdue: 0,
    paid: 0,
  };
  let totalOwed = 0;

  for (const invoice of invoiceList) {
    if (invoice.status === "draft") {
      statusCounts.draft++;
    }
    if (invoice.status === "sent") {
      statusCounts.open++;
    }
    if (invoice.status === "overdue") {
      statusCounts.overdue++;
    }
    if (invoice.status === "paid") {
      statusCounts.paid++;
    }
    if (invoice.status === "sent" || invoice.status === "overdue") {
      totalOwed += Number(invoice.balance);
    }
  }

  const filtered = invoiceList.filter((invoice) => {
    const matchesStatus =
      activeFilter === "all" ||
      (activeFilter === "open" ? invoice.status === "sent" : invoice.status === activeFilter);
    return matchesStatus && matchesInvoiceSearch(invoice, query);
  });
  const filteredOwed = filtered.reduce(
    (sum, invoice) =>
      invoice.status === "sent" || invoice.status === "overdue"
        ? sum + Number(invoice.balance)
        : sum,
    0,
  );
  const defaultCurrency = org.defaultCurrency ?? "EUR";
  const exportStatus = activeFilter === "open" ? "sent" : activeFilter;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="nota-label mb-2.5">
            {invoiceList.length} {invoiceList.length === 1 ? "invoice" : "invoices"}{" "}
            <span className="opacity-40">/</span> {formatCurrency(totalOwed, defaultCurrency)} owed
          </p>
          <h1>Invoices</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <InvoiceArchiveMenu status={exportStatus === "all" ? undefined : exportStatus} />
          <Button asChild className="min-h-11 sm:min-h-8" size="sm">
            <Link href="/invoices/new">
              <Plus />
              New invoice
            </Link>
          </Button>
        </div>
      </header>

      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b pb-3">
        <nav aria-label="Invoice status" className="flex max-w-full min-w-0 flex-wrap gap-1">
          {FILTERS.map(({ key, label }) => (
            <Link
              aria-current={activeFilter === key ? "page" : undefined}
              className={
                activeFilter === key
                  ? "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md border border-foreground bg-foreground px-3 text-sm font-medium text-background"
                  : "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md border border-transparent px-3 text-sm font-medium hover:bg-card"
              }
              href={filterHref(key, query)}
              key={key}
            >
              {label}
              <span
                className={`font-mono text-[11px] ${
                  key === "overdue" && activeFilter !== key ? "text-destructive" : "opacity-70"
                }`}
              >
                {statusCounts[key]}
              </span>
            </Link>
          ))}
        </nav>

        <form
          action="/invoices"
          className="flex min-h-9 w-full items-center rounded-md border bg-card px-3 sm:w-[300px]"
        >
          {activeFilter !== "all" ? (
            <input name="status" type="hidden" value={activeFilter} />
          ) : null}
          <label className="nota-label mr-2.5" htmlFor="invoice-search">
            Find
          </label>
          <input
            className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            defaultValue={query}
            id="invoice-search"
            name="q"
            placeholder="client, number, amount"
            type="search"
          />
          <button className="sr-only" type="submit">
            Search invoices
          </button>
        </form>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
            <FileText className="size-6 text-muted-foreground" />
          </div>
          <p className="mb-1 text-sm font-medium">
            {query
              ? "No matching invoices"
              : activeFilter === "all"
                ? "No invoices yet"
                : `No ${activeFilter} invoices`}
          </p>
          <p className="mb-4 text-sm text-muted-foreground">
            {query
              ? "Try a different client, number, or amount."
              : activeFilter === "all"
                ? "Create your first invoice to get started."
                : "Try another status or return to all invoices."}
          </p>
          {activeFilter === "all" && !query ? (
            <Button asChild size="sm">
              <Link href="/invoices/new">
                <Plus />
                Create invoice
              </Link>
            </Button>
          ) : (
            <Button asChild size="sm" variant="outline">
              <Link href="/invoices">View all invoices</Link>
            </Button>
          )}
        </div>
      ) : (
        <div
          className="w-[calc(100vw-2rem)] max-w-full overflow-hidden rounded-md border border-border/70 bg-background sm:w-full"
          style={{ contain: "layout paint" }}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] border-collapse text-sm">
              <thead>
                <tr className="nota-label text-left text-muted-foreground">
                  <th className="w-[100px] px-3 py-2 font-medium">Number</th>
                  <th className="min-w-[180px] px-3 py-2 font-medium">Client</th>
                  <th className="w-[90px] px-3 py-2 font-medium">Issued</th>
                  <th className="w-[105px] px-3 py-2 font-medium">Due</th>
                  <th className="w-[110px] px-3 py-2 font-medium">Status</th>
                  <th className="w-[100px] px-3 py-2 font-medium">Made in</th>
                  <th className="w-[310px] px-3 py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((invoice) => {
                  const displayStatus = getInvoiceListStatus(invoice);
                  const href = `/invoices/${invoice.id}`;
                  return (
                    <tr
                      className="border-t border-border/50 transition-colors hover:bg-card"
                      data-testid="invoice-list-row"
                      key={invoice.id}
                    >
                      <td className="px-3 py-2.5">
                        <Link className="font-mono text-xs font-medium hover:underline" href={href}>
                          {invoice.number}
                        </Link>
                      </td>
                      <td className="max-w-[260px] px-3 py-2.5">
                        <Link className="block truncate font-semibold" href={href}>
                          {invoice.clientName ?? "Unknown client"}
                          {Number(invoice.paidAmount) > 0 && Number(invoice.balance) > 0 ? (
                            <span className="ml-1 font-normal text-muted-foreground">
                              {formatCurrency(
                                Number(invoice.paidAmount),
                                invoice.currency ?? defaultCurrency,
                              )}{" "}
                              received
                            </span>
                          ) : null}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                        <Link href={href}>
                          {invoice.status === "draft" ? "—" : formatDate(invoice.issuedAt)}
                        </Link>
                      </td>
                      <td
                        className={`px-3 py-2.5 font-mono text-xs ${
                          invoice.status === "overdue"
                            ? "font-medium text-destructive"
                            : "text-muted-foreground"
                        }`}
                      >
                        <Link href={href}>
                          {invoice.status === "draft"
                            ? "—"
                            : formatInvoiceDueDate(invoice.dueAt, invoice.status)}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5">
                        <Link className="inline-flex" href={href}>
                          <StatusBadge openCount={invoice.openCount} status={displayStatus} />
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">
                        <Link href={href}>{sourceLabel(invoice.source, invoice.sourceClient)}</Link>
                      </td>
                      <td className="py-1.5 pr-1 pl-3">
                        <div className="flex items-center justify-end gap-2">
                          <Link className="font-mono font-medium" href={href}>
                            {formatCurrency(
                              Number(invoice.total ?? 0),
                              invoice.currency ?? defaultCurrency,
                            )}
                          </Link>
                          <InvoiceRowActions
                            invoice={{
                              id: invoice.id,
                              number: invoice.number,
                              status: invoice.status,
                              stripePaymentLinkUrl: invoice.stripePaymentLinkUrl,
                            }}
                            role={role}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t">
                  <td className="nota-label px-3 py-3 text-foreground" colSpan={6}>
                    Showing {filtered.length} of {invoiceList.length}{" "}
                    <span className="opacity-40">/</span> owed on this page
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-lg font-semibold">
                    {formatCurrency(filteredOwed, defaultCurrency)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function filterHref(status: FilterKey, query: string) {
  const params = new URLSearchParams();
  if (status !== "all") {
    params.set("status", status);
  }
  if (query) {
    params.set("q", query);
  }
  const search = params.toString();
  return search ? `/invoices?${search}` : "/invoices";
}

function formatDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function sourceLabel(source: string, sourceClient: string | null) {
  if (sourceClient) {
    return sourceClient;
  }
  if (source === "chat") {
    return "Nota chat";
  }
  if (source === "cli") {
    return "CLI";
  }
  if (source === "mcp") {
    return "MCP";
  }
  if (source === "api") {
    return "API";
  }
  if (source === "system") {
    return "System";
  }
  return "Web";
}
