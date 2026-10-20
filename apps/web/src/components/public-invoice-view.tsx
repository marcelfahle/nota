import { ArrowRight, Download, FileCode } from "lucide-react";

import { RubberStamp } from "@/components/nota-marks";
import { formatOrgAddress } from "@/lib/branding";
import { documentLocaleOf, getTranslator, toIntlLocale } from "@/lib/i18n";
import { orgCountryCode } from "@/lib/invoice-compliance";
import { formatClientAddress, isDomestic } from "@/lib/postal-address";
import type { PublicInvoice } from "@/lib/public-invoice";
import { formatTaxIdentifier, invoiceTaxIdentifier } from "@/lib/tax-identifier";
import { taxTreatmentNote } from "@/lib/tax-treatment";
import { formatCurrency, formatDate, formatNumber, formatQuantity } from "@/lib/utils";

export function PublicInvoiceView({ invoice, token }: { invoice: PublicInvoice; token: string }) {
  const currency = invoice.currency ?? "EUR";
  // The page speaks the language the document was issued in, not the viewer's.
  const language = documentLocaleOf(invoice, invoice.organization);
  const locale = toIntlLocale(language);
  const t = getTranslator(language, "public");
  const address = {
    locale: language,
    omitCountry: isDomestic({ countryCode: orgCountryCode(invoice.organization) }, invoice.client),
  };
  const businessName = invoice.organization.businessName ?? invoice.organization.name;
  const businessAddress = formatOrgAddress(invoice.organization, address);
  const clientAddress = [invoice.client.company, formatClientAddress(invoice.client, address)]
    .filter(Boolean)
    .join("\n");
  const servicePeriod =
    invoice.servicePeriodStart && invoice.servicePeriodEnd
      ? invoice.servicePeriodStart === invoice.servicePeriodEnd
        ? formatDate(invoice.servicePeriodStart, locale)
        : `${formatDate(invoice.servicePeriodStart, locale)} – ${formatDate(invoice.servicePeriodEnd, locale)}`
      : null;
  const taxNote = taxTreatmentNote(invoice.taxTreatment, language);
  const showVat = invoice.taxTreatment !== "exempt_small_business";
  const isCreditNote = invoice.kind === "credit_note";
  const isPaid = !isCreditNote && invoice.settlementStatus === "paid";
  const paymentLinkUrl = !isCreditNote && !isPaid ? invoice.stripePaymentLinkUrl : null;
  const brandColor = invoice.organization.brandColor ?? "#86efac";
  const sellerTaxIdentifier = invoiceTaxIdentifier(
    invoice.status,
    invoice.sellerTaxIdentifier,
    invoice.organization,
  );
  const clientTaxIdentifier = invoiceTaxIdentifier(
    invoice.status,
    invoice.clientTaxIdentifier,
    invoice.client,
  );

  return (
    <main className="min-h-dvh bg-[#efede8] px-3 py-5 text-[#1f1b16] sm:px-6 sm:py-10">
      <article className="invoice-paper mx-auto max-w-[760px] overflow-hidden border border-black/10 shadow-[0_20px_55px_rgba(31,27,22,0.13)]">
        <div className="p-5 sm:p-10 lg:p-12">
          <header className="flex items-start justify-between gap-5 border-b border-black/10 pb-7 sm:pb-9">
            <div className="flex min-w-0 items-start gap-3">
              {invoice.organization.logoUrl ? (
                <img
                  alt={t("logoAlt", { business: businessName })}
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
                {sellerTaxIdentifier ? (
                  <p>{formatTaxIdentifier(sellerTaxIdentifier, language)}</p>
                ) : null}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <h1 className="text-3xl font-bold tracking-[-0.04em] sm:text-5xl">
                {isCreditNote ? t("creditNote") : t("invoice")}
              </h1>
              <p className="mt-1 font-mono text-xs text-[#6b655c] sm:text-sm">{invoice.number}</p>
              {isCreditNote && invoice.originalNumber ? (
                <p className="mt-1 text-xs text-[#6b655c]">
                  {t("creditNoteFor", { number: invoice.originalNumber })}
                </p>
              ) : null}
            </div>
          </header>

          <section className="grid grid-cols-2 gap-x-5 gap-y-5 border-b border-black/10 py-7 sm:grid-cols-3 sm:py-9">
            <div className="col-span-2 sm:col-span-1">
              <h2 className="nota-label text-[#6b655c]">{t("billedTo")}</h2>
              <p className="mt-2 text-sm font-bold">{invoice.client.name}</p>
              {clientAddress ? (
                <p className="mt-0.5 text-xs leading-5 whitespace-pre-line text-[#6b655c]">
                  {clientAddress}
                </p>
              ) : null}
              {clientTaxIdentifier ? (
                <p className="mt-0.5 text-xs text-[#6b655c]">
                  {formatTaxIdentifier(clientTaxIdentifier, language)}
                </p>
              ) : null}
            </div>
            <div>
              <h2 className="nota-label text-[#6b655c]">{t("issued")}</h2>
              <p className="mt-2 font-mono text-xs sm:text-sm">
                {formatDate(invoice.issuedAt, locale)}
              </p>
            </div>
            <div>
              <h2 className="nota-label text-[#6b655c]">{t("due")}</h2>
              <p className="mt-2 font-mono text-xs sm:text-sm">
                {formatDate(invoice.dueAt, locale)}
              </p>
            </div>
            {servicePeriod ? (
              <div>
                <h2 className="nota-label text-[#6b655c]">
                  {invoice.servicePeriodStart === invoice.servicePeriodEnd
                    ? t("serviceDate")
                    : t("servicePeriod")}
                </h2>
                <p className="mt-2 font-mono text-xs sm:text-sm">{servicePeriod}</p>
              </div>
            ) : null}
            {invoice.buyerReference ? (
              <div>
                <h2 className="nota-label text-[#6b655c]">{t("buyerReference")}</h2>
                <p className="mt-2 font-mono text-xs sm:text-sm">{invoice.buyerReference}</p>
              </div>
            ) : null}
          </section>

          <section aria-labelledby="line-items-heading" className="py-7 sm:py-9">
            <h2 className="sr-only" id="line-items-heading">
              {t("lineItems")}
            </h2>
            <div>
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-black/10 text-[#6b655c]">
                    <th className="nota-label pb-3 font-medium" scope="col">
                      {t("description")}
                    </th>
                    <th className="nota-label w-16 pb-3 text-right font-medium" scope="col">
                      {t("quantity")}
                    </th>
                    <th className="nota-label w-28 pb-3 text-right font-medium" scope="col">
                      {t("amount")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lineItems.map((item) => (
                    <tr className="border-b border-black/10 align-top" key={item.id}>
                      <th className="min-w-0 py-4 pr-3 font-medium" scope="row">
                        {item.description}
                        <span className="mt-1 block font-mono text-[11px] font-normal text-[#6b655c]">
                          {t("each", {
                            price: formatCurrency(Number(item.unitPrice), currency, locale),
                          })}
                        </span>
                      </th>
                      <td className="py-4 text-right font-mono text-xs">
                        {formatQuantity(item.quantity, locale)}
                      </td>
                      <td className="py-4 text-right font-mono text-xs font-medium">
                        {formatCurrency(Number(item.amount), currency, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section
            aria-label={t("totals")}
            className="ml-auto max-w-sm border-b border-black/10 pb-7 sm:pb-9"
          >
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-6">
                <dt className="text-[#6b655c]">{t("subtotal")}</dt>
                <dd className="font-mono">
                  {formatCurrency(Number(invoice.subtotal ?? 0), currency, locale)}
                </dd>
              </div>
              {showVat ? (
                <div className="flex justify-between gap-6">
                  <dt className="text-[#6b655c]">
                    {t("vat", { rate: formatNumber(Number(invoice.taxRate ?? 0), locale) })}
                  </dt>
                  <dd className="font-mono">
                    {formatCurrency(Number(invoice.taxAmount ?? 0), currency, locale)}
                  </dd>
                </div>
              ) : null}
              {invoice.settlementStatus === "partially_paid" ? (
                <div className="flex justify-between gap-6">
                  <dt className="text-[#6b655c]">{t("paid")}</dt>
                  <dd className="font-mono">
                    −{formatCurrency(Number(invoice.paidAmount), currency, locale)}
                  </dd>
                </div>
              ) : null}
            </dl>
            <div className="mt-6 flex items-end justify-between gap-5">
              <p className="nota-label pb-1">{isPaid ? t("totalPaid") : t("totalDue")}</p>
              <p className="font-mono text-2xl font-bold tracking-[-0.04em] sm:text-4xl">
                {formatCurrency(Number(isPaid ? invoice.total : invoice.balance), currency, locale)}
              </p>
            </div>
            {taxNote ? <p className="mt-4 text-xs text-[#6b655c]">{taxNote}</p> : null}
            {!isPaid && !isCreditNote ? (
              <p className="mt-4 text-xs text-[#6b655c]">
                {t("payableBy", { date: formatDate(invoice.dueAt, locale) })}
              </p>
            ) : null}
            {isPaid ? (
              <div className="mt-8 flex justify-end pr-3">
                <RubberStamp>{t("paidStamp")}</RubberStamp>
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
              <span>
                {t("pay", { amount: formatCurrency(Number(invoice.balance), currency, locale) })}
              </span>
              <span className="flex items-center gap-2 font-mono text-xs">
                {t("securePayment")} <ArrowRight className="size-4" />
              </span>
            </a>
          ) : null}

          {invoice.bankAccount ? (
            <section
              aria-labelledby="bank-heading"
              className="mt-7 border border-black/10 p-4 sm:mt-9 sm:p-5"
            >
              <h2 className="nota-label" id="bank-heading">
                {t("bankTransfer")}
              </h2>
              <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-[9rem_1fr]">
                <dt className="text-[#6b655c]">{t("reference")}</dt>
                <dd className="font-mono">{t("referenceValue", { number: invoice.number })}</dd>
                {invoice.bankAccount.iban ? (
                  <>
                    <dt className="text-[#6b655c]">{t("iban")}</dt>
                    <dd className="font-mono break-all">{invoice.bankAccount.iban}</dd>
                  </>
                ) : null}
                {invoice.bankAccount.bic ? (
                  <>
                    <dt className="text-[#6b655c]">{t("bic")}</dt>
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
                {t("payments")}
              </h2>
              <ul className="mt-3 divide-y divide-black/10 border-y border-black/10">
                {invoice.payments.map((payment) => (
                  <li
                    className="flex items-center justify-between gap-4 py-3 text-xs"
                    key={payment.id}
                  >
                    <span>
                      {t(
                        `paymentMethod.${payment.method === "bank_transfer" || payment.method === "stripe" ? payment.method : "other"}`,
                      )}{" "}
                      · {formatDate(payment.receivedAt, locale)}
                    </span>
                    <span className="font-mono font-medium">
                      {formatCurrency(Number(payment.amount), payment.currency, locale)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {invoice.notes ? (
            <section aria-labelledby="notes-heading" className="mt-7 sm:mt-9">
              <h2 className="nota-label" id="notes-heading">
                {t("notes")}
              </h2>
              <p className="mt-2 text-sm leading-6 whitespace-pre-line text-[#6b655c]">
                {invoice.notes}
              </p>
            </section>
          ) : null}

          {!isCreditNote ? <p className="mt-7 text-sm sm:mt-9">{t("thanks")}</p> : null}

          <footer className="mt-9 flex flex-wrap items-center justify-between gap-4 border-t border-black/10 pt-5 text-xs text-[#6b655c]">
            <span className="flex flex-wrap items-center gap-4">
              <a
                className="inline-flex items-center gap-2 font-medium text-[#1f1b16] underline-offset-4 hover:underline"
                href={`/api/public/invoices/${token}/pdf`}
              >
                <Download className="size-4" />
                {t("downloadPdf")}
              </a>
              {invoice.xrechnungAvailable ? (
                <a
                  className="inline-flex items-center gap-2 font-medium text-[#1f1b16] underline-offset-4 hover:underline"
                  data-testid="public-invoice-xrechnung"
                  href={`/api/public/invoices/${token}/xrechnung`}
                >
                  <FileCode className="size-4" />
                  {t("downloadXml")}
                </a>
              ) : null}
            </span>
            {invoice.organization.website ? (
              <span className="font-mono">
                {invoice.organization.website.replace(/^https?:\/\//, "")}
              </span>
            ) : null}
          </footer>
        </div>
      </article>
      <p className="mt-5 text-center text-xs text-[#6b655c]">
        {t("sentWith")} <span className="font-bold text-[#1f1b16]">Nota.</span>
      </p>
    </main>
  );
}
