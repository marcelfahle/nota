"use client";

import { ArrowLeft, BadgeCheck, Copy, Download, FileCode, Pencil, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { useState } from "react";

import {
  cancelInvoice,
  createCreditNote,
  deleteInvoice,
  duplicateInvoice,
  markInvoiceSent,
  recordInvoicePayment,
  sendInvoice,
  sendReminder,
} from "@/actions/invoices";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AuthenticatedRole } from "@/lib/auth";
import { parseInvoiceAttachments } from "@/lib/e-invoice-delivery";
import { toIntlLocale, type AppLocale } from "@/lib/i18n";
import { invoiceActivityText } from "@/lib/invoice-activity";
import {
  canCancelInvoice as canCancelStatus,
  normalizeInvoiceStatus,
} from "@/lib/invoice-lifecycle";
import { translateProblem } from "@/lib/invoice-problems";
import {
  canCancelInvoice,
  canDeleteInvoice,
  canMarkInvoicePaid,
  canSendInvoice,
  canSendInvoiceReminder,
} from "@/lib/roles";
import { type TaxTreatment, taxTreatmentNote } from "@/lib/tax-treatment";
import {
  cn,
  formatCurrency,
  formatDate,
  formatNumber,
  formatQuantity,
  type Locale,
} from "@/lib/utils";

type ActivityEntry = {
  action: string;
  createdAt: string;
  id: string;
  metadata: unknown;
  source: "api" | "chat" | "cli" | "mcp" | "system" | "web";
  sourceClient: string | null;
};

type StoredDocument = {
  byteSize: number;
  createdAt: string;
  id: string;
  kind: "pdf" | "xrechnung";
  sha256: string;
};

type InvoiceDetailProps = {
  activities: Array<ActivityEntry>;
  business: {
    address: string | null;
    brandColor: string | null;
    logoUrl: string | null;
    name: string;
  };
  /** The language the document is written in: statutory notes follow it, not the UI. */
  documentLocale: AppLocale;
  /** Issued originals, exactly as the customer received them. */
  documents: Array<StoredDocument>;
  invoice: {
    balance: string;
    buyerReference: string | null;
    client: {
      address?: string | null;
      company?: string | null;
      email: string;
      name: string;
      taxIdentifier?: {
        canonicalValue: string;
        countryCode: string | null;
        type: "eu_vat" | "tax_id" | "us_ein";
        value: string;
      } | null;
      vatNumber?: string | null;
      vatStatus?: "invalid" | "unavailable" | "valid" | null;
    };
    currency: string | null;
    dueAt: string;
    id: string;
    issuedAt: string;
    issueProblems: Array<string>;
    kind: "credit_note" | "invoice";
    lineItems: Array<{
      amount: string;
      description: string;
      id: string;
      quantity: string;
      unitPrice: string;
    }>;
    notes: string | null;
    number: string;
    paidAmount: string;
    servicePeriodEnd: string | null;
    servicePeriodStart: string | null;
    settlementStatus: "paid" | "partially_paid" | "unpaid";
    status: string | null;
    subtotal: string | null;
    taxAmount: string | null;
    taxRate: string | null;
    taxTreatment: TaxTreatment;
    total: string | null;
    viewCount: number;
  };
  /** The member's UI language; the document itself keeps its own. */
  locale: AppLocale;
  role: AuthenticatedRole;
};

const ACTIVITY_ACTIONS = [
  "cancelled",
  "created",
  "credited",
  "marked_overdue",
  "paid",
  "proposal_approved",
  "reminder_sent",
  "sent",
  "viewed",
] as const;

type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

function isActivityAction(action: string): action is ActivityAction {
  return (ACTIVITY_ACTIONS as ReadonlyArray<string>).includes(action);
}

type Translate = ReturnType<typeof useTranslations<"invoiceDetail">>;

function formatBytes(size: number) {
  return size < 1024 ? `${size} B` : `${Math.round(size / 1024)} KB`;
}

/** The invoice a history entry points at: the credit note, or the original it corrects. */
function relatedInvoiceId(metadata: unknown) {
  const record =
    metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : null;
  const id = record?.creditNoteId ?? record?.creditsInvoiceId;
  return typeof id === "string" ? id : null;
}

function formatServicePeriod(start: string | null, end: string | null, locale: Locale) {
  if (!start || !end) {
    return null;
  }
  return start === end
    ? formatDate(start, locale)
    : `${formatDate(start, locale)} – ${formatDate(end, locale)}`;
}

function daysUntil(value: string) {
  const due = new Date(`${value}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
}

function sourceLabel(activity: ActivityEntry, t: Translate) {
  if (activity.sourceClient) {
    return activity.sourceClient;
  }
  if (activity.source === "chat") {
    return t("source.chat");
  }
  if (activity.source === "system" && activity.action === "paid") {
    return t("source.stripe");
  }
  if (activity.source === "system" && activity.action === "viewed") {
    return t("source.publicPage");
  }
  if (activity.source === "api") {
    return t("source.api");
  }
  if (activity.source === "cli") {
    return t("source.cli");
  }
  if (activity.source === "mcp") {
    return t("source.mcp");
  }
  return t("source.nota");
}

/** The history line in the member's language; anything newer than the message list stays English. */
function activityText(activity: ActivityEntry, currency: string, locale: Locale, t: Translate) {
  const metadata =
    activity.metadata && typeof activity.metadata === "object"
      ? (activity.metadata as Record<string, unknown>)
      : null;
  if (activity.action === "paid" && typeof metadata?.amount === "string") {
    return t("activity.paymentRecorded", {
      amount: formatCurrency(Number(metadata.amount), currency, locale),
    });
  }
  if (activity.action === "created" && typeof metadata?.originalNumber === "string") {
    return t("activity.creditNoteCreated", { number: metadata.originalNumber });
  }
  if (activity.action === "credited" && typeof metadata?.creditNoteNumber === "string") {
    return t("activity.creditedBy", { number: metadata.creditNoteNumber });
  }
  if (activity.action === "sent" && Array.isArray(metadata?.attachments)) {
    return parseInvoiceAttachments(metadata.attachments).includes("xml")
      ? t("activity.sentWithXml")
      : t("activity.sentWithPdf");
  }
  if (isActivityAction(activity.action)) {
    return t(`activity.${activity.action}`);
  }
  return invoiceActivityText(activity, currency);
}

export function InvoiceDetailView({
  activities,
  business,
  documentLocale,
  documents,
  invoice,
  locale: language,
  role,
}: InvoiceDetailProps) {
  const t = useTranslations("invoiceDetail");
  const tTreatment = useTranslations("taxTreatment");
  const tProblems = useTranslations("problems");
  const router = useRouter();
  const currency = invoice.currency ?? "EUR";
  const locale = toIntlLocale(language);
  const status = normalizeInvoiceStatus(invoice.status);
  const total = Number(invoice.total ?? 0);
  const paid = Number(invoice.paidAmount);
  const balance = Number(invoice.balance);
  const paidPercent = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  const remainingDays = daysUntil(invoice.dueAt);
  const canRecordPayment =
    invoice.kind === "invoice" &&
    ["sent", "overdue"].includes(status) &&
    balance > 0 &&
    canMarkInvoicePaid(role);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState(invoice.balance);
  const [paymentMethod, setPaymentMethod] = useState<"bank_transfer" | "other">("bank_transfer");
  const [paymentNote, setPaymentNote] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "error" | "notice"; text: string } | null>(null);

  async function runAction(name: string, action: () => Promise<{ error?: string } | void>) {
    setPending(name);
    setMessage(null);
    const result = await action();
    if (result?.error) {
      setMessage({ kind: "error", text: result.error });
    } else {
      const event =
        name === "send"
          ? "invoice_sent"
          : name === "mark-sent"
            ? "invoice_marked_sent"
            : name === "reminder"
              ? "invoice_reminder_sent"
              : null;
      if (event) {
        posthog.capture(event, { currency, invoice_kind: invoice.kind });
      }
      router.refresh();
    }
    setPending(null);
  }

  async function handlePayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending("payment");
    setMessage(null);
    const result = await recordInvoicePayment(invoice.id, {
      amount: Number(paymentAmount),
      method: paymentMethod,
      note: paymentNote.trim() || undefined,
    });
    if (result.error) {
      setMessage({ kind: "error", text: result.error });
      setPending(null);
      return;
    }
    setPaymentOpen(false);
    if (result.warning) {
      setMessage({ kind: "notice", text: result.warning });
    }
    posthog.capture("invoice_payment_recorded", {
      currency,
      payment_method: paymentMethod,
    });
    router.refresh();
    setPending(null);
  }

  async function handleDuplicate() {
    setPending("duplicate");
    setMessage(null);
    const result = await duplicateInvoice(invoice.id);
    if ("error" in result) {
      setMessage({ kind: "error", text: result.error });
      setPending(null);
      return;
    }
    router.push(`/invoices/${result.invoiceId}`);
  }

  async function handleCreditNote() {
    setPending("credit-note");
    setMessage(null);
    const result = await createCreditNote(invoice.id);
    if (result.error) {
      setMessage({ kind: "error", text: result.error });
      setPending(null);
      return;
    }
    router.push(`/invoices/${result.invoiceId}`);
  }

  async function handleDestructiveAction(action: "cancel" | "delete") {
    const question =
      action === "delete"
        ? t("confirmDelete", { number: invoice.number })
        : t("confirmCancel", { number: invoice.number });
    if (!window.confirm(question)) {
      return;
    }
    setPending(action);
    setMessage(null);
    const result =
      action === "delete" ? await deleteInvoice(invoice.id) : await cancelInvoice(invoice.id);
    if (result.error) {
      setMessage({ kind: "error", text: result.error });
      setPending(null);
      return;
    }
    if (action === "delete") {
      router.push("/invoices");
      return;
    }
    posthog.capture("invoice_cancelled", { currency, invoice_kind: invoice.kind });
    router.refresh();
    setPending(null);
  }

  const servicePeriod = formatServicePeriod(
    invoice.servicePeriodStart,
    invoice.servicePeriodEnd,
    locale,
  );
  const taxNote = taxTreatmentNote(invoice.taxTreatment, documentLocale);
  const showVat = invoice.taxTreatment !== "exempt_small_business";
  const stamp =
    invoice.kind === "credit_note"
      ? status === "cancelled"
        ? t("stamp.cancelled")
        : null
      : invoice.settlementStatus === "partially_paid"
        ? t("stamp.part_paid")
        : invoice.settlementStatus === "paid"
          ? t("stamp.paid")
          : status === "cancelled"
            ? t("stamp.cancelled")
            : null;

  // One list, newest first: what happened and the originals stored at issuance.
  const history = [
    ...activities.map((activity) => ({
      createdAt: activity.createdAt,
      detail: t("via", {
        date: formatDate(activity.createdAt, locale),
        source: sourceLabel(activity, t),
      }),
      href: null,
      id: activity.id,
      relatedId: relatedInvoiceId(activity.metadata),
      text: activityText(activity, currency, locale, t),
    })),
    ...documents.map((document) => ({
      createdAt: document.createdAt,
      detail: t("documentDetail", {
        date: formatDate(document.createdAt, locale),
        sha: document.sha256.slice(0, 12),
        size: formatBytes(document.byteSize),
      }),
      href: `/api/invoices/${invoice.id}/${document.kind === "pdf" ? "pdf" : "xrechnung"}`,
      id: document.id,
      relatedId: null,
      text:
        document.kind === "pdf" ? t("activity.originalPdfStored") : t("activity.originalXmlStored"),
    })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <article aria-labelledby="invoice-title" className="min-w-0 space-y-6">
      <header className="space-y-5 border-b pb-6">
        <Link
          className="nota-label inline-flex items-center gap-2 text-muted-foreground hover:text-foreground"
          href="/invoices"
        >
          <ArrowLeft className="size-3.5" />
          {t("breadcrumb", { kind: t(`kind.${invoice.kind}`) })}
        </Link>
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <h1 className="break-words" id="invoice-title">
            {invoice.number}{" "}
            <span className="font-normal text-muted-foreground">{invoice.client.name}</span>
          </h1>
          <div aria-label={t("actions")} className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <a href={`/api/invoices/${invoice.id}/pdf`} rel="noopener noreferrer" target="_blank">
                <Download /> {t("pdf")}
              </a>
            </Button>
            <Button asChild size="sm" variant="outline">
              <a
                href={`/api/invoices/${invoice.id}/xrechnung`}
                rel="noopener noreferrer"
                target="_blank"
              >
                <FileCode /> {t("xrechnung")}
              </a>
            </Button>
            {invoice.kind === "invoice" && ["sent", "overdue", "paid"].includes(status) ? (
              <Button
                disabled={pending !== null}
                onClick={handleCreditNote}
                size="sm"
                variant="outline"
              >
                {pending === "credit-note" ? t("creating") : t("creditNote")}
              </Button>
            ) : null}
            <Button
              disabled={pending !== null}
              onClick={handleDuplicate}
              size="sm"
              variant="outline"
            >
              <Copy /> {pending === "duplicate" ? t("duplicating") : t("duplicate")}
            </Button>
            {status === "draft" ? (
              <>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/invoices/${invoice.id}/edit`}>
                    <Pencil /> {t("edit")}
                  </Link>
                </Button>
                {canSendInvoice(role) ? (
                  <>
                    <Button
                      data-testid="invoice-send"
                      disabled={pending !== null}
                      onClick={() => runAction("send", () => sendInvoice(invoice.id))}
                      size="sm"
                    >
                      <Send /> {pending === "send" ? t("sending") : t("sendInvoice")}
                    </Button>
                    <Button
                      data-testid="invoice-mark-sent"
                      disabled={pending !== null}
                      onClick={() => runAction("mark-sent", () => markInvoiceSent(invoice.id))}
                      size="sm"
                      variant="outline"
                    >
                      {pending === "mark-sent" ? t("marking") : t("markSent")}
                    </Button>
                  </>
                ) : null}
              </>
            ) : canRecordPayment ? (
              <Button
                data-testid="invoice-record-payment"
                onClick={() => {
                  setPaymentAmount(invoice.balance);
                  setPaymentOpen(true);
                }}
                size="sm"
              >
                {t("recordPayment")}
              </Button>
            ) : null}
          </div>
        </div>
        {message ? (
          <p
            className={
              message.kind === "error"
                ? "text-sm text-destructive"
                : "text-sm text-muted-foreground"
            }
            role={message.kind === "error" ? "alert" : "status"}
          >
            {message.text}
          </p>
        ) : null}
        {status === "draft" && invoice.issueProblems.length ? (
          <div
            className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
            data-testid="invoice-issue-problems"
            role="status"
          >
            <p className="font-medium">{t("fixBefore")}</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5">
              {invoice.issueProblems.map((problem) => (
                <li key={problem}>
                  {translateProblem(problem, tProblems, (treatment) =>
                    tTreatment(`labels.${treatment}`),
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.55fr)]">
        <section
          aria-label={t("preview")}
          className="overflow-hidden rounded-lg border p-4 sm:p-8"
          style={{
            backgroundColor: "var(--paper-2)",
            backgroundImage: "radial-gradient(var(--line) 1px, transparent 1px)",
            backgroundSize: "8px 8px",
          }}
        >
          <div
            className={cn(
              "invoice-paper relative mx-auto min-h-[720px] max-w-[720px] border p-7 shadow-sm sm:p-12",
              // The pay bar sits at the foot of the paper; long notes must not run under it.
              invoice.kind === "invoice" && "pb-28 sm:pb-32",
            )}
          >
            <div className="flex items-start justify-between gap-8 border-b pb-8">
              <div className="flex items-start gap-3">
                {business.logoUrl ? (
                  <img alt="" className="size-10 object-contain" src={business.logoUrl} />
                ) : (
                  <span
                    aria-hidden="true"
                    className="grid size-10 place-items-center rounded-md text-lg font-bold text-white"
                    style={{ backgroundColor: business.brandColor || "#1f1b16" }}
                  >
                    {business.name.slice(0, 1)}
                  </span>
                )}
                <div>
                  <p className="font-semibold">{business.name}</p>
                  <p className="mt-1 max-w-52 text-xs leading-relaxed whitespace-pre-line text-zinc-500">
                    {business.address}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-3xl font-semibold">{t(`kind.${invoice.kind}`)}</p>
                <p className="mt-1 font-mono text-sm text-zinc-500">{invoice.number}</p>
              </div>
            </div>

            <dl className="grid gap-6 border-b py-7 text-sm sm:grid-cols-3">
              <div>
                <dt className="nota-label text-zinc-500">{t("billedTo")}</dt>
                <dd className="mt-2 font-semibold">
                  {invoice.client.company || invoice.client.name}
                </dd>
                <dd className="mt-1 text-xs leading-relaxed whitespace-pre-line text-zinc-500">
                  {invoice.client.address?.replaceAll(String.raw`\n`, "\n")}
                </dd>
              </div>
              <div>
                <dt className="nota-label text-zinc-500">{t("issued")}</dt>
                <dd className="mt-2 font-mono text-xs">{formatDate(invoice.issuedAt, locale)}</dd>
              </div>
              <div>
                <dt className="nota-label text-zinc-500">{t("due")}</dt>
                <dd className="mt-2 font-mono text-xs">{formatDate(invoice.dueAt, locale)}</dd>
              </div>
              {servicePeriod ? (
                <div>
                  <dt className="nota-label text-zinc-500">
                    {invoice.servicePeriodStart === invoice.servicePeriodEnd
                      ? t("serviceDate")
                      : t("servicePeriod")}
                  </dt>
                  <dd className="mt-2 font-mono text-xs" data-testid="invoice-service-period">
                    {servicePeriod}
                  </dd>
                </div>
              ) : null}
              {invoice.buyerReference ? (
                <div>
                  <dt className="nota-label text-zinc-500">{t("buyerReference")}</dt>
                  <dd className="mt-2 font-mono text-xs">{invoice.buyerReference}</dd>
                </div>
              ) : null}
            </dl>

            <div className="py-7">
              <table className="w-full table-fixed text-sm">
                <thead>
                  <tr className="nota-label border-b text-left text-zinc-500">
                    <th className="pb-3 font-medium">{t("description")}</th>
                    <th className="w-16 pb-3 text-right font-medium">{t("quantity")}</th>
                    <th className="w-28 pb-3 text-right font-medium">{t("amount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lineItems.map((item) => (
                    <tr className="border-b" key={item.id}>
                      <td className="py-5 pr-4">
                        <span className="font-medium">{item.description}</span>
                        <span className="mt-1 block font-mono text-xs text-zinc-500">
                          {t("each", {
                            price: formatCurrency(Number(item.unitPrice), currency, locale),
                          })}
                        </span>
                      </td>
                      <td className="py-5 text-right font-mono text-xs whitespace-nowrap">
                        {formatQuantity(item.quantity, locale)}
                      </td>
                      <td className="py-5 text-right font-mono text-xs whitespace-nowrap">
                        {formatCurrency(Number(item.amount), currency, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <dl className="mt-6 ml-auto w-full max-w-64 space-y-2 font-mono text-xs">
                <div className="flex justify-between">
                  <dt className="text-zinc-500">{t("subtotal")}</dt>
                  <dd>{formatCurrency(Number(invoice.subtotal), currency, locale)}</dd>
                </div>
                {showVat ? (
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">
                      {t("vat", { rate: formatNumber(Number(invoice.taxRate ?? 0), locale) })}
                    </dt>
                    <dd>{formatCurrency(Number(invoice.taxAmount), currency, locale)}</dd>
                  </div>
                ) : null}
                <div className="mt-3 flex justify-between border-t pt-3 text-sm font-bold">
                  <dt>{t("total")}</dt>
                  <dd>{formatCurrency(total, currency, locale)}</dd>
                </div>
              </dl>
              {taxNote ? (
                <p className="mt-4 pb-4 text-xs text-zinc-500" data-testid="invoice-tax-note">
                  {taxNote}
                </p>
              ) : null}
            </div>

            {stamp ? (
              <div className="rubber-stamp ml-8" data-testid="invoice-status">
                {stamp}
              </div>
            ) : (
              <span className="sr-only" data-testid="invoice-status">
                {status[0].toUpperCase() + status.slice(1).replaceAll("_", " ")}
              </span>
            )}
            {invoice.notes ? (
              <p className="mt-auto border-t pt-5 text-xs leading-relaxed text-zinc-500">
                {invoice.notes}
              </p>
            ) : null}
            {invoice.kind === "invoice" ? (
              <div
                className="absolute right-7 bottom-7 left-7 flex items-center justify-between rounded-md px-5 py-4 text-sm font-semibold text-white sm:right-12 sm:left-12"
                style={{ backgroundColor: business.brandColor || "#1f1b16" }}
              >
                <span>
                  {balance > 0
                    ? t("amountDue", { amount: formatCurrency(balance, currency, locale) })
                    : t("settled")}
                </span>
                <span aria-hidden="true">→</span>
              </div>
            ) : null}
          </div>
        </section>

        <aside aria-label={t("details")} className="space-y-8">
          <section className="border-b pb-7">
            <p className="nota-label text-muted-foreground">{t("stillOwed")}</p>
            <p className="mt-2 text-4xl font-semibold tabular-nums">
              {formatCurrency(balance, currency, locale)}
            </p>
            <div
              aria-label={t("paidPercent", { percent: paidPercent })}
              className="mt-5 h-2 overflow-hidden rounded-full bg-muted ring-1 ring-border"
              role="img"
            >
              <div className="h-full bg-primary" style={{ width: `${paidPercent}%` }} />
            </div>
            <div className="mt-2 flex justify-between font-mono text-[11px] text-muted-foreground">
              <span>{t("paidAmount", { amount: formatCurrency(paid, currency, locale) })}</span>
              <span>
                {balance <= 0 || status === "cancelled"
                  ? t("settled")
                  : remainingDays < 0
                    ? t("overdueDays", { days: Math.abs(remainingDays) })
                    : remainingDays === 0
                      ? t("dueToday")
                      : t("daysUntilDue", { days: remainingDays })}
              </span>
            </div>
          </section>

          <section className="border-b pb-7">
            <h2 className="nota-label">{t("client")}</h2>
            <dl className="mt-4 space-y-4 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">{t("billedTo")}</dt>
                <dd className="mt-1 font-medium">
                  {invoice.client.company || invoice.client.name}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("sentTo")}</dt>
                <dd className="mt-1 break-all">{invoice.client.email}</dd>
              </div>
              {invoice.client.taxIdentifier ? (
                <div>
                  <dt className="text-xs text-muted-foreground">
                    {invoice.client.taxIdentifier.type === "eu_vat"
                      ? t("vatId")
                      : invoice.client.taxIdentifier.type === "us_ein"
                        ? t("ein")
                        : t("taxId")}
                  </dt>
                  <dd className="mt-1 flex items-center gap-1.5 font-mono text-xs">
                    {invoice.client.taxIdentifier.value}
                    {invoice.client.taxIdentifier.type === "eu_vat" &&
                    invoice.client.vatStatus === "valid" ? (
                      <BadgeCheck aria-label={t("verified")} className="size-4 text-emerald-600" />
                    ) : null}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="text-xs text-muted-foreground">{t("taxRule")}</dt>
                <dd className="mt-1">
                  {invoice.taxTreatment === "standard"
                    ? t("vatRate", { rate: formatNumber(Number(invoice.taxRate ?? 0), locale) })
                    : tTreatment(`labels.${invoice.taxTreatment}`)}
                </dd>
              </div>
            </dl>
          </section>

          <section>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="nota-label">{t("whatHappened")}</h2>
              {invoice.viewCount > 0 ? (
                <span className="font-mono text-[11px] text-muted-foreground">
                  {t("opens", { count: invoice.viewCount })}
                </span>
              ) : null}
            </div>
            {history.length ? (
              <ol className="mt-5 space-y-5">
                {history.map((entry) => (
                  <li className="grid grid-cols-[8px_1fr] gap-3" key={entry.id}>
                    <span className="mt-1.5 size-2 rounded-full bg-foreground" />
                    <div>
                      <p className="text-sm">
                        {entry.text}
                        {entry.href ? (
                          <>
                            {" · "}
                            <a
                              className="underline underline-offset-4"
                              href={entry.href}
                              rel="noopener noreferrer"
                              target="_blank"
                            >
                              {t("download")}
                            </a>
                          </>
                        ) : null}
                        {entry.relatedId ? (
                          <>
                            {" · "}
                            <Link
                              className="underline underline-offset-4"
                              href={`/invoices/${entry.relatedId}`}
                            >
                              {t("open")}
                            </Link>
                          </>
                        ) : null}
                      </p>
                      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                        {entry.detail}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">{t("noActivity")}</p>
            )}
            {(status === "sent" || status === "overdue") && canSendInvoiceReminder(role) ? (
              <Button
                className="mt-6"
                disabled={pending !== null}
                onClick={() => runAction("reminder", () => sendReminder(invoice.id))}
                size="sm"
                variant="outline"
              >
                {pending === "reminder" ? t("sending") : t("sendReminder")}
              </Button>
            ) : null}
            {status === "draft" && canDeleteInvoice(role) ? (
              <Button
                className="mt-3 text-destructive"
                disabled={pending !== null}
                onClick={() => handleDestructiveAction("delete")}
                size="sm"
                variant="ghost"
              >
                {pending === "delete" ? t("deleting") : t("deleteDraft")}
              </Button>
            ) : canCancelInvoice(role) && canCancelStatus(status) ? (
              <Button
                className="mt-3 text-destructive"
                disabled={pending !== null}
                onClick={() => handleDestructiveAction("cancel")}
                size="sm"
                variant="ghost"
              >
                {pending === "cancel" ? t("cancelling") : t("cancelInvoice")}
              </Button>
            ) : null}
          </section>
        </aside>
      </div>

      <Dialog onOpenChange={setPaymentOpen} open={paymentOpen}>
        <DialogContent>
          <form onSubmit={handlePayment}>
            <DialogHeader>
              <DialogTitle>{t("payment.title")}</DialogTitle>
              <DialogDescription>{t("payment.description")}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-5 py-6">
              <div className="grid gap-2">
                <Label htmlFor="payment-amount">{t("payment.amount", { currency })}</Label>
                <Input
                  autoFocus
                  id="payment-amount"
                  max={invoice.balance}
                  min="0.01"
                  onChange={(event) => setPaymentAmount(event.target.value)}
                  required
                  step="0.01"
                  type="number"
                  value={paymentAmount}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="payment-method">{t("payment.method")}</Label>
                <Select
                  onValueChange={(value: "bank_transfer" | "other") => setPaymentMethod(value)}
                  value={paymentMethod}
                >
                  <SelectTrigger className="w-full" id="payment-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank_transfer">{t("payment.bankTransfer")}</SelectItem>
                    <SelectItem value="other">{t("payment.other")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="payment-note">
                  {t("payment.note")}{" "}
                  <span className="font-normal text-muted-foreground">{t("payment.optional")}</span>
                </Label>
                <Input
                  id="payment-note"
                  onChange={(event) => setPaymentNote(event.target.value)}
                  value={paymentNote}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                disabled={pending === "payment"}
                onClick={() => setPaymentOpen(false)}
                type="button"
                variant="outline"
              >
                {t("payment.cancel")}
              </Button>
              <Button
                data-testid="invoice-payment-submit"
                disabled={pending === "payment"}
                type="submit"
              >
                {pending === "payment" ? t("payment.recording") : t("payment.submit")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </article>
  );
}
