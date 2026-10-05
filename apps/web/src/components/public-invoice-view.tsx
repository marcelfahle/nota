import { ArrowRight, Download } from "lucide-react";

import { RubberStamp } from "@/components/nota-marks";
import { formatOrgAddress } from "@/lib/branding";
import type { PublicInvoice } from "@/lib/public-invoice";
import { formatTaxIdentifier, taxIdentifierFromColumns } from "@/lib/tax-identifier";
import { formatCurrency } from "@/lib/utils";

function formatDate(value: string | Date) {
  const date = typeof value === "string" ? new Date(`${value}T00:00:00Z`) : value;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  });
}

function formatQuantity(value: string) {
  return Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function formatPercentage(value: string | null) {
  return Number(value ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function paymentMethodLabel(method: string) {
  if (method === "bank_transfer") {
    return "Bank transfer";
  }
  if (method === "stripe") {
    return "Card payment";
  }
  return "Payment";
}

export function PublicInvoiceView({ invoice, token }: { invoice: PublicInvoice; token: string }) {
  const currency = invoice.currency ?? "EUR";
  const businessName = invoice.organization.businessName ?? invoice.organization.name;
  const businessAddress = formatOrgAddress(invoice.organization);
  const clientAddress = [invoice.client.company, invoice.client.address].filter(Boolean).join("\n");
  const isCreditNote = invoice.kind === "credit_note";
  const isPaid = !isCreditNote && invoice.settlementStatus === "paid";
  const paymentLinkUrl = !isCreditNote && !isPaid ? invoice.stripePaymentLinkUrl : null;
  const brandColor = invoice.organization.brandColor ?? "#86efac";
  const sellerTaxIdentifier =
    invoice.sellerTaxIdentifier ?? taxIdentifierFromColumns(invoice.organization);
  const clientTaxIdentifier =
    invoice.clientTaxIdentifier ?? taxIdentifierFromColumns(invoice.client);

  return (
    <main className="min-h-dvh bg-[#efede8] px-3 py-5 text-[#1f1b16] sm:px-6 sm:py-10">
      <article className="invoice-paper mx-auto max-w-[760px] overflow-hidden border border-black/10 shadow-[0_20px_55px_rgba(31,27,22,0.13)]">
        <div className="p-5 sm:p-10 lg:p-12">
          <header className="flex items-start justify-between gap-5 border-b border-black/10 pb-7 sm:pb-9">
            <div className="flex min-w-0 items-start gap-3">
              {invoice.organization.logoUrl ? (
                <img
                  alt={`${businessName} logo`}
                  className="size-10 shrink-0 rounded-md object-contain sm:size-12"
                  src={invoice.organization.logoUrl}
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="grid size-10 shrink-0 place-items-center rounded-md text-base font-bold sm:size-12"
                  style={{ backgroundColor: brandColor }}
                >
                  {businessName.slice(0, 1).toUpperCase()}
                </span>
              )}
              <div className="min-w-0 text-xs leading-5 text-[#6b655c]">
                <p className="truncate text-sm font-bold text-[#1f1b16]">{businessName}</p>
                {businessAddress ? <p className="whitespace-pre-line">{businessAddress}</p> : null}
                {sellerTaxIdentifier ? <p>{formatTaxIdentifier(sellerTaxIdentifier)}</p> : null}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <h1 className="text-3xl font-bold tracking-[-0.04em] sm:text-5xl">
                {isCreditNote ? "Credit note" : "Invoice"}
              </h1>
              <p className="mt-1 font-mono text-xs text-[#6b655c] sm:text-sm">{invoice.number}</p>
            </div>
          </header>

          <section className="grid grid-cols-2 gap-x-5 gap-y-5 border-b border-black/10 py-7 sm:grid-cols-3 sm:py-9">
            <div className="col-span-2 sm:col-span-1">
              <h2 className="nota-label text-[#6b655c]">Billed to</h2>
              <p className="mt-2 text-sm font-bold">{invoice.client.name}</p>
              {clientAddress ? (
                <p className="mt-0.5 text-xs leading-5 whitespace-pre-line text-[#6b655c]">
                  {clientAddress}
                </p>
              ) : null}
              {clientTaxIdentifier ? (
                <p className="mt-0.5 text-xs text-[#6b655c]">
                  {formatTaxIdentifier(clientTaxIdentifier)}
                </p>
              ) : null}
            </div>
            <div>
              <h2 className="nota-label text-[#6b655c]">Issued</h2>
              <p className="mt-2 font-mono text-xs sm:text-sm">{formatDate(invoice.issuedAt)}</p>
            </div>
            <div>
              <h2 className="nota-label text-[#6b655c]">Due</h2>
              <p className="mt-2 font-mono text-xs sm:text-sm">{formatDate(invoice.dueAt)}</p>
            </div>
          </section>

          <section aria-labelledby="line-items-heading" className="py-7 sm:py-9">
            <h2 className="sr-only" id="line-items-heading">
              Line items
            </h2>
            <div>
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-black/10 text-[#6b655c]">
                    <th className="nota-label pb-3 font-medium" scope="col">
                      Description
                    </th>
                    <th className="nota-label w-16 pb-3 text-right font-medium" scope="col">
                      Qty
                    </th>
                    <th className="nota-label w-28 pb-3 text-right font-medium" scope="col">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lineItems.map((item) => (
                    <tr className="border-b border-black/10 align-top" key={item.id}>
                      <th className="min-w-0 py-4 pr-3 font-medium" scope="row">
                        {item.description}
                        <span className="mt-1 block font-mono text-[11px] font-normal text-[#6b655c]">
                          {formatCurrency(Number(item.unitPrice), currency)} each
                        </span>
                      </th>
                      <td className="py-4 text-right font-mono text-xs">
                        {formatQuantity(item.quantity)}
                      </td>
                      <td className="py-4 text-right font-mono text-xs font-medium">
                        {formatCurrency(Number(item.amount), currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section
            aria-label="Totals"
            className="ml-auto max-w-sm border-b border-black/10 pb-7 sm:pb-9"
          >
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-6">
                <dt className="text-[#6b655c]">Subtotal</dt>
                <dd className="font-mono">
                  {formatCurrency(Number(invoice.subtotal ?? 0), currency)}
                </dd>
              </div>
              <div className="flex justify-between gap-6">
                <dt className="text-[#6b655c]">
                  VAT {formatPercentage(invoice.taxRate)}%
                  {invoice.reverseCharge === "true" ? " · reverse charge" : ""}
                </dt>
                <dd className="font-mono">
                  {formatCurrency(Number(invoice.taxAmount ?? 0), currency)}
                </dd>
              </div>
              {invoice.settlementStatus === "partially_paid" ? (
                <div className="flex justify-between gap-6">
                  <dt className="text-[#6b655c]">Paid</dt>
                  <dd className="font-mono">
                    −{formatCurrency(Number(invoice.paidAmount), currency)}
                  </dd>
                </div>
              ) : null}
            </dl>
            <div className="mt-6 flex items-end justify-between gap-5">
              <p className="nota-label pb-1">{isPaid ? "Total paid" : "Total due"}</p>
              <p className="font-mono text-2xl font-bold tracking-[-0.04em] sm:text-4xl">
                {formatCurrency(Number(isPaid ? invoice.total : invoice.balance), currency)}
              </p>
            </div>
            {isPaid ? (
              <div className="mt-8 flex justify-end pr-3">
                <RubberStamp>Paid</RubberStamp>
              </div>
            ) : null}
          </section>

          {paymentLinkUrl ? (
            <a
              className="mt-7 flex min-h-12 items-center justify-between gap-4 px-4 text-sm font-bold transition-opacity hover:opacity-90 sm:mt-9 sm:px-5"
              href={paymentLinkUrl}
              rel="noreferrer"
              style={{ backgroundColor: brandColor }}
            >
              <span>Pay {formatCurrency(Number(invoice.balance), currency)}</span>
              <span className="flex items-center gap-2 font-mono text-xs">
                Secure payment <ArrowRight className="size-4" />
              </span>
            </a>
          ) : null}

          {invoice.bankAccount ? (
            <section
              aria-labelledby="bank-heading"
              className="mt-7 border border-black/10 p-4 sm:mt-9 sm:p-5"
            >
              <h2 className="nota-label" id="bank-heading">
                Bank transfer
              </h2>
              <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-[7rem_1fr]">
                <dt className="text-[#6b655c]">Reference</dt>
                <dd className="font-mono">{invoice.number}</dd>
                {invoice.bankAccount.iban ? (
                  <>
                    <dt className="text-[#6b655c]">IBAN</dt>
                    <dd className="font-mono break-all">{invoice.bankAccount.iban}</dd>
                  </>
                ) : null}
                {invoice.bankAccount.bic ? (
                  <>
                    <dt className="text-[#6b655c]">BIC</dt>
                    <dd className="font-mono">{invoice.bankAccount.bic}</dd>
                  </>
                ) : null}
              </dl>
              <p className="mt-3 text-xs leading-5 whitespace-pre-line text-[#6b655c]">
                {invoice.bankAccount.details}
              </p>
            </section>
          ) : null}

          {invoice.payments.length ? (
            <section aria-labelledby="payments-heading" className="mt-7 sm:mt-9">
              <h2 className="nota-label" id="payments-heading">
                Payments
              </h2>
              <ul className="mt-3 divide-y divide-black/10 border-y border-black/10">
                {invoice.payments.map((payment) => (
                  <li
                    className="flex items-center justify-between gap-4 py-3 text-xs"
                    key={payment.id}
                  >
                    <span>
                      {paymentMethodLabel(payment.method)} · {formatDate(payment.receivedAt)}
                    </span>
                    <span className="font-mono font-medium">
                      {formatCurrency(Number(payment.amount), payment.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {invoice.notes ? (
            <section aria-labelledby="notes-heading" className="mt-7 sm:mt-9">
              <h2 className="nota-label" id="notes-heading">
                Notes
              </h2>
              <p className="mt-2 text-sm leading-6 whitespace-pre-line text-[#6b655c]">
                {invoice.notes}
              </p>
            </section>
          ) : null}

          <footer className="mt-9 flex flex-wrap items-center justify-between gap-4 border-t border-black/10 pt-5 text-xs text-[#6b655c]">
            <a
              className="inline-flex items-center gap-2 font-medium text-[#1f1b16] underline-offset-4 hover:underline"
              href={`/api/public/invoices/${token}/pdf`}
            >
              <Download className="size-4" />
              Download PDF
            </a>
            {invoice.organization.website ? (
              <span className="font-mono">
                {invoice.organization.website.replace(/^https?:\/\//, "")}
              </span>
            ) : null}
          </footer>
        </div>
      </article>
      <p className="mt-5 text-center text-xs text-[#6b655c]">
        Sent with <span className="font-bold text-[#1f1b16]">Nota.</span>
      </p>
    </main>
  );
}
