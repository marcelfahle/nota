import { and, asc, desc, eq, gt, gte, isNull, lt, or, sql } from "drizzle-orm";
import Link from "next/link";

import { FirstRunHome, type FirstRunHomeData } from "@/components/first-run-home";
import { HomeContent } from "@/components/home-content";
import { HomeProposal } from "@/components/home-proposal";
import { HighlighterSwipe } from "@/components/nota-marks";
import { StatusBadge } from "@/components/status-badge";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { bankAccounts, clients, invoices, jobs, payments, proposals } from "@/lib/db/schema";
import { getInvoiceDetail } from "@/lib/invoice-service";
import { formatCurrency } from "@/lib/utils";

const balance = sql<string>`greatest(coalesce(${invoices.total}::numeric, 0) - coalesce((select sum(p.amount) from payments p where p.invoice_id = ${invoices.id}), 0) - abs(coalesce((select sum(c.total::numeric) from invoices c where c.credits_invoice_id = ${invoices.id} and c.kind = 'credit_note' and c.status in ('sent', 'overdue', 'paid')), 0)), 0)`;

export default async function HomePage() {
  const { org, user } = await getCurrentUser();

  if (!org.firstRunCompletedAt) {
    const [firstInvoice, [bankAccount]] = await Promise.all([
      db
        .select({ id: invoices.id })
        .from(invoices)
        .where(and(eq(invoices.orgId, org.id), eq(invoices.kind, "invoice")))
        .orderBy(asc(invoices.createdAt))
        .limit(1),
      db
        .select({
          bic: bankAccounts.bic,
          details: bankAccounts.details,
          iban: bankAccounts.iban,
          name: bankAccounts.name,
        })
        .from(bankAccounts)
        .where(and(eq(bankAccounts.orgId, org.id), eq(bankAccounts.isDefault, true)))
        .limit(1),
    ]);
    const invoice = firstInvoice[0] ? await getInvoiceDetail(org.id, firstInvoice[0].id) : null;
    const [testJob] = invoice
      ? await db
          .select({ id: jobs.id })
          .from(jobs)
          .where(and(eq(jobs.invoiceId, invoice.id), eq(jobs.type, "send_invoice_test_email")))
          .limit(1)
      : [];
    const data: FirstRunHomeData = {
      bankAccount: bankAccount ?? null,
      email: user.email,
      emailVerified: user.emailVerified,
      invoice: invoice
        ? {
            client: invoice.client ?? { email: "", name: "Unknown client" },
            currency: invoice.currency ?? org.defaultCurrency ?? "EUR",
            dueAt: invoice.dueAt,
            id: invoice.id,
            issuedAt: invoice.issuedAt,
            lineItems: invoice.lineItems.map((item) => ({
              amount: item.amount,
              description: item.description,
              id: item.id,
              quantity: item.quantity,
            })),
            number: invoice.number,
            total: invoice.total ?? "0.00",
          }
        : null,
      org: {
        brandColor: org.brandColor,
        businessName: org.businessName,
        city: org.city,
        country: org.country,
        legalName: org.legalName,
        logoUrl: org.logoUrl,
        name: org.name,
        postalCode: org.postalCode,
        street: org.street,
        vatNumber: org.vatNumber,
      },
      testSent: Boolean(testJob),
    };
    return <FirstRunHome data={data} />;
  }

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const [invoiceList, received, pendingProposals] = await Promise.all([
    db
      .select({
        balance,
        clientName: clients.name,
        currency: invoices.currency,
        id: invoices.id,
        number: invoices.number,
        paidAmount: sql<string>`coalesce((select sum(p.amount) from payments p where p.invoice_id = ${invoices.id}), 0)`,
        status: invoices.status,
        total: invoices.total,
      })
      .from(invoices)
      .leftJoin(clients, and(eq(clients.id, invoices.clientId), eq(clients.orgId, org.id)))
      .where(and(eq(invoices.orgId, org.id), eq(invoices.kind, "invoice")))
      .orderBy(desc(invoices.issuedAt), desc(invoices.createdAt)),
    db
      .select({
        amount: sql<string>`coalesce(sum(${payments.amount}), 0)`,
        currency: payments.currency,
      })
      .from(payments)
      .where(
        and(
          eq(payments.orgId, org.id),
          gte(payments.receivedAt, monthStart),
          lt(payments.receivedAt, nextMonth),
        ),
      )
      .groupBy(payments.currency),
    db
      .select({
        balance,
        clientName: clients.name,
        currency: invoices.currency,
        dueAt: invoices.dueAt,
        id: proposals.id,
        reason: proposals.reason,
      })
      .from(proposals)
      .innerJoin(invoices, and(eq(invoices.id, proposals.invoiceId), eq(invoices.orgId, org.id)))
      .innerJoin(clients, and(eq(clients.id, invoices.clientId), eq(clients.orgId, org.id)))
      .where(
        and(
          eq(proposals.orgId, org.id),
          eq(proposals.kind, "send_reminder"),
          eq(proposals.status, "pending"),
          or(isNull(proposals.expiresAt), gt(proposals.expiresAt, now)),
        ),
      )
      .orderBy(desc(proposals.createdAt))
      .limit(3),
  ]);

  if (invoiceList.length === 0) {
    return (
      <HomeContent
        empty
        summary={
          <div className="space-y-2">
            <h1>Welcome to Nota.</h1>
            <p className="font-voice text-xl text-muted-foreground">
              Tell me about your first invoice and we’ll send it together.
            </p>
          </div>
        }
      />
    );
  }

  const defaultCurrency = org.defaultCurrency ?? "EUR";
  const owed = new Map<string, number>();
  const overdue = new Map<string, number>();
  for (const invoice of invoiceList) {
    const currency = invoice.currency ?? defaultCurrency;
    if (invoice.status === "sent" || invoice.status === "overdue") {
      owed.set(currency, (owed.get(currency) ?? 0) + Number(invoice.balance));
    }
    if (invoice.status === "overdue") {
      overdue.set(currency, (overdue.get(currency) ?? 0) + Number(invoice.balance));
    }
  }
  const receivedByCurrency = new Map(
    received.map((row) => [row.currency, Number(row.amount)] as const),
  );
  const month = now.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });

  return (
    <HomeContent
      summary={
        <div className="space-y-2.5">
          <h1>
            <HighlighterSwipe>
              {formatMoneyTotals(receivedByCurrency, defaultCurrency)}
            </HighlighterSwipe>
            {` in so far this ${month}.`}
          </h1>
          <p className="text-lg text-muted-foreground">
            {formatMoneyTotals(owed, defaultCurrency)} still owed to you,{" "}
            <span className="text-destructive">
              {formatMoneyTotals(overdue, defaultCurrency)} of it late.
            </span>
          </p>
        </div>
      }
    >
      <section aria-labelledby="ready-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-2.5">
          <h2 className="nota-label text-foreground" id="ready-heading">
            Ready for you
          </h2>
          <p className="nota-label">Nothing goes out until you say so</p>
        </div>
        {pendingProposals.length > 0 ? (
          <ul>
            {pendingProposals.map((proposal) => {
              const daysLate = Math.max(
                0,
                Math.floor(
                  (Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
                    Date.parse(`${proposal.dueAt}T00:00:00Z`)) /
                    86_400_000,
                ),
              );
              return (
                <HomeProposal id={proposal.id} key={proposal.id}>
                  <strong className="font-semibold">
                    {proposal.clientName} is {daysLate} day{daysLate === 1 ? "" : "s"} late
                  </strong>{" "}
                  on{" "}
                  {formatCurrency(Number(proposal.balance), proposal.currency ?? defaultCurrency)}.{" "}
                  <span className="text-muted-foreground">{sentence(proposal.reason)}</span>
                </HomeProposal>
              );
            })}
          </ul>
        ) : (
          <p className="border-b border-border/50 px-1 py-4 text-sm text-muted-foreground">
            You’re all caught up.
          </p>
        )}
      </section>

      <section aria-labelledby="recent-heading">
        <div className="flex items-baseline justify-between gap-2 border-b pb-2.5">
          <h2 className="nota-label text-foreground" id="recent-heading">
            Recent
          </h2>
          <Link className="text-[13px] underline-offset-4 hover:underline" href="/invoices">
            All invoices
          </Link>
        </div>
        <ul>
          {invoiceList.slice(0, 5).map((invoice) => {
            const status =
              Number(invoice.paidAmount) > 0 && Number(invoice.balance) > 0
                ? "part_paid"
                : (invoice.status ?? "draft");
            return (
              <li className="border-b border-border/50" key={invoice.id}>
                <Link
                  className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-1 py-2 hover:bg-card active:bg-card sm:min-h-12 sm:grid-cols-[5.5rem_minmax(0,1fr)_auto_7rem] sm:gap-x-4"
                  href={`/invoices/${invoice.id}`}
                >
                  <span className="col-start-1 row-start-1 font-mono text-xs text-muted-foreground">
                    {invoice.number}
                  </span>
                  <span className="col-start-1 row-start-2 truncate font-medium sm:col-start-2 sm:row-start-1">
                    {invoice.clientName}
                  </span>
                  <span className="col-start-2 row-start-1 justify-self-end sm:col-start-3">
                    <StatusBadge status={status} />
                  </span>
                  <span className="col-start-2 row-start-2 text-right font-mono text-sm sm:col-start-4 sm:row-start-1">
                    {formatCurrency(
                      Number(invoice.total ?? 0),
                      invoice.currency ?? defaultCurrency,
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </HomeContent>
  );
}

function formatMoneyTotals(totals: Map<string, number>, defaultCurrency: string) {
  const amounts = [...totals]
    .filter(([, amount]) => amount !== 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, amount]) => formatCurrency(amount, currency));

  return amounts.length > 0
    ? new Intl.ListFormat("en-US", { style: "long", type: "conjunction" }).format(amounts)
    : formatCurrency(0, defaultCurrency);
}

function sentence(value: string) {
  const trimmed = value.trim();
  return trimmed.endsWith(".") ? trimmed : `${trimmed}.`;
}
