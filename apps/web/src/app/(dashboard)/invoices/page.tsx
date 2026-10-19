import { and, desc, eq, sql } from "drizzle-orm";
import { FileText, Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { InvoiceArchiveMenu } from "@/components/invoice-archive-menu";
import { InvoiceRowActions } from "@/components/invoice-row-actions";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { clients, invoices } from "@/lib/db/schema";
import { toIntlLocale } from "@/lib/i18n";
import {
  formatInvoiceDueDate,
  getInvoiceListStatus,
  matchesInvoiceSearch,
} from "@/lib/invoice-list";
import { formatCurrency, formatDate } from "@/lib/utils";

const FILTERS = ["all", "draft", "open", "overdue", "paid"] as const;

type FilterKey = (typeof FILTERS)[number];

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; status?: string | string[] }>;
}) {
  const params = await searchParams;
  const filterStatus = first(params.status);
  const query = first(params.q)?.trim() ?? "";
  const { org, role, user } = await getCurrentUser();
  const locale = toIntlLocale(user.locale);
  const t = await getTranslations("invoices");

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

  const activeFilter = FILTERS.some((key) => key === filterStatus)
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
    return matchesStatus && matchesInvoiceSearch(invoice, query, locale);
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
            {t("count", { count: invoiceList.length })} <span className="opacity-40">/</span>{" "}
            {t("owed", { amount: formatCurrency(totalOwed, defaultCurrency, locale) })}
          </p>
          <h1>{t("title")}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <InvoiceArchiveMenu status={exportStatus === "all" ? undefined : exportStatus} />
          <Button asChild className="min-h-11 sm:min-h-8" size="sm">
            <Link href="/invoices/new">
              <Plus />
              {t("newInvoice")}
            </Link>
          </Button>
        </div>
      </header>

      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b pb-3">
        <nav aria-label={t("statusNav")} className="flex max-w-full min-w-0 flex-wrap gap-1">
          {FILTERS.map((key) => (
            <Link
              aria-current={activeFilter === key ? "page" : undefined}
              className={
                activeFilter === key
                  ? "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md border border-foreground bg-foreground px-3 text-sm font-medium text-background sm:min-h-9"
                  : "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md border border-transparent px-3 text-sm font-medium hover:bg-card active:bg-card sm:min-h-9"
              }
              href={filterHref(key, query)}
              key={key}
            >
              {t(`filters.${key}`)}
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
          className="flex min-h-11 w-full items-center rounded-md border bg-card px-3 sm:min-h-9 sm:w-[300px]"
        >
          {activeFilter !== "all" ? (
            <input name="status" type="hidden" value={activeFilter} />
          ) : null}
          <label className="nota-label mr-2.5" htmlFor="invoice-search">
            {t("find")}
          </label>
          <input
            className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            defaultValue={query}
            id="invoice-search"
            name="q"
            placeholder={t("searchPlaceholder")}
            type="search"
          />
          <button className="sr-only" type="submit">
            {t("searchInvoices")}
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
              ? t("empty.noMatch")
              : activeFilter === "all"
                ? t("empty.none")
                : t("empty.noneStatus", { status: t(`filters.${activeFilter}`).toLowerCase() })}
          </p>
          <p className="mb-4 text-sm text-muted-foreground">
            {query
              ? t("empty.tryDifferent")
              : activeFilter === "all"
                ? t("empty.createFirst")
                : t("empty.tryAnother")}
          </p>
          {activeFilter === "all" && !query ? (
            <Button asChild size="sm">
              <Link href="/invoices/new">
                <Plus />
                {t("createInvoice")}
              </Link>
            </Button>
          ) : (
            <Button asChild size="sm" variant="outline">
              <Link href="/invoices">{t("viewAll")}</Link>
            </Button>
          )}
        </div>
      ) : (
        <div
          className="w-[calc(100vw-2rem)] max-w-full overflow-hidden rounded-md border border-border/70 bg-background sm:w-full"
          style={{ contain: "layout paint" }}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-sm">
              <thead>
                <tr className="nota-label text-left text-muted-foreground">
                  <th className="w-[100px] px-3 py-2 font-medium">{t("columns.number")}</th>
                  <th className="min-w-[180px] px-3 py-2 font-medium">{t("columns.client")}</th>
                  <th className="w-[100px] px-3 py-2 font-medium">{t("columns.issued")}</th>
                  <th className="w-[115px] px-3 py-2 font-medium">{t("columns.due")}</th>
                  <th className="w-[110px] px-3 py-2 font-medium">{t("columns.status")}</th>
                  <th className="w-[100px] px-3 py-2 font-medium">{t("columns.madeIn")}</th>
                  <th className="w-[280px] px-3 py-2 text-right font-medium">
                    {t("columns.amount")}
                  </th>
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
                          {invoice.clientName ?? t("unknownClient")}
                          {Number(invoice.paidAmount) > 0 && Number(invoice.balance) > 0 ? (
                            <span className="ml-1 font-normal text-muted-foreground">
                              {t("received", {
                                amount: formatCurrency(
                                  Number(invoice.paidAmount),
                                  invoice.currency ?? defaultCurrency,
                                  locale,
                                ),
                              })}
                            </span>
                          ) : null}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                        <Link href={href}>
                          {invoice.status === "draft"
                            ? "—"
                            : formatDate(invoice.issuedAt, locale, {
                                day: "numeric",
                                month: "short",
                              })}
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
                            : formatInvoiceDueDate(
                                invoice.dueAt,
                                invoice.status,
                                new Date(),
                                locale,
                              )}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5">
                        <Link className="inline-flex" href={href}>
                          <StatusBadge openCount={invoice.openCount} status={displayStatus} />
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">
                        <Link href={href}>
                          {invoice.sourceClient ?? t(`source.${sourceKey(invoice.source)}`)}
                        </Link>
                      </td>
                      <td className="py-1.5 pr-1 pl-3">
                        <div className="flex items-center justify-end gap-2">
                          <Link className="font-mono font-medium" href={href}>
                            {formatCurrency(
                              Number(invoice.total ?? 0),
                              invoice.currency ?? defaultCurrency,
                              locale,
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
                    {t("showing", { shown: filtered.length, total: invoiceList.length })}{" "}
                    <span className="opacity-40">/</span> {t("owedOnPage")}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-lg font-semibold">
                    {formatCurrency(filteredOwed, defaultCurrency, locale)}
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

function sourceKey(source: string) {
  return source === "chat" ||
    source === "cli" ||
    source === "mcp" ||
    source === "api" ||
    source === "system"
    ? source
    : "web";
}
