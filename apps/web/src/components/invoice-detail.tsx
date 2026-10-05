"use client";

import { ArrowLeft, BadgeCheck, Copy, Download, FileCode, Pencil, Send } from "lucide-react";
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
import {
  canCancelInvoice as canCancelStatus,
  normalizeInvoiceStatus,
} from "@/lib/invoice-lifecycle";
import {
  canCancelInvoice,
  canDeleteInvoice,
  canMarkInvoicePaid,
  canSendInvoice,
  canSendInvoiceReminder,
} from "@/lib/roles";
import { formatCurrency } from "@/lib/utils";

type ActivityEntry = {
  action: string;
  createdAt: string;
  id: string;
  metadata: unknown;
  source: "api" | "chat" | "cli" | "mcp" | "system" | "web";
  sourceClient: string | null;
};

type InvoiceDetailProps = {
  activities: Array<ActivityEntry>;
  business: {
    address: string | null;
    brandColor: string | null;
    city: string | null;
    country: string | null;
    logoUrl: string | null;
    name: string;
    region: string | null;
  };
  invoice: {
    balance: string;
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
    reverseCharge: string | null;
    settlementStatus: "paid" | "partially_paid" | "unpaid";
    status: string | null;
    subtotal: string | null;
    taxAmount: string | null;
    taxRate: string | null;
    total: string | null;
    viewCount: number;
  };
  role: AuthenticatedRole;
};

const ACTIVITY_LABELS: Record<string, string> = {
  cancelled: "Invoice cancelled",
  created: "Invoice created",
  marked_overdue: "Invoice marked overdue",
  paid: "Payment recorded",
  reminder_sent: "Payment reminder sent",
  sent: "Invoice sent",
  viewed: "Invoice opened",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(value));
}

function daysUntil(value: string) {
  const due = new Date(`${value}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
}

function sourceLabel(activity: ActivityEntry) {
  if (activity.sourceClient) {
    return activity.sourceClient;
  }
  if (activity.source === "chat") {
    return "Nota Chat";
  }
  if (activity.source === "system" && activity.action === "paid") {
    return "Stripe";
  }
  if (activity.source === "system" && activity.action === "viewed") {
    return "public invoice";
  }
  if (activity.source === "api") {
    return "API";
  }
  if (activity.source === "cli") {
    return "Nota CLI";
  }
  if (activity.source === "mcp") {
    return "MCP";
  }
  return "Nota";
}

function activityText(activity: ActivityEntry, currency: string) {
  const metadata =
    activity.metadata && typeof activity.metadata === "object"
      ? (activity.metadata as Record<string, unknown>)
      : null;
  if (activity.action === "paid" && typeof metadata?.amount === "string") {
    return `${formatCurrency(Number(metadata.amount), currency)} payment recorded`;
  }
  return ACTIVITY_LABELS[activity.action] ?? activity.action.replaceAll("_", " ");
}

export function InvoiceDetailView({ activities, business, invoice, role }: InvoiceDetailProps) {
  const router = useRouter();
  const currency = invoice.currency ?? "EUR";
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
    const verb = action === "delete" ? "delete" : "cancel";
    if (!window.confirm(`Are you sure you want to ${verb} ${invoice.number}?`)) {
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

  const stamp =
    invoice.kind === "credit_note"
      ? status === "cancelled"
        ? "Cancelled"
        : null
      : invoice.settlementStatus === "partially_paid"
        ? "Part paid"
        : invoice.settlementStatus === "paid"
          ? "Paid"
          : status === "cancelled"
            ? "Cancelled"
            : null;

  return (
    <article aria-labelledby="invoice-title" className="min-w-0 space-y-6">
      <header className="space-y-5 border-b pb-6">
        <Link
          className="nota-label inline-flex items-center gap-2 text-muted-foreground hover:text-foreground"
          href="/invoices"
        >
          <ArrowLeft className="size-3.5" />
          Invoices / {invoice.kind === "credit_note" ? "Credit note" : "Invoice"}
        </Link>
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <h1 className="break-words" id="invoice-title">
            {invoice.number}{" "}
            <span className="font-normal text-muted-foreground">{invoice.client.name}</span>
          </h1>
          <div aria-label="Invoice actions" className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <a href={`/api/invoices/${invoice.id}/pdf`} rel="noopener noreferrer" target="_blank">
                <Download /> PDF
              </a>
            </Button>
            <Button asChild size="sm" variant="outline">
              <a
                href={`/api/invoices/${invoice.id}/xrechnung`}
                rel="noopener noreferrer"
                target="_blank"
              >
                <FileCode /> XRechnung
              </a>
            </Button>
            {invoice.kind === "invoice" && ["sent", "overdue", "paid"].includes(status) ? (
              <Button
                disabled={pending !== null}
                onClick={handleCreditNote}
                size="sm"
                variant="outline"
              >
                {pending === "credit-note" ? "Creating…" : "Credit note"}
              </Button>
            ) : null}
            <Button
              disabled={pending !== null}
              onClick={handleDuplicate}
              size="sm"
              variant="outline"
            >
              <Copy /> {pending === "duplicate" ? "Duplicating…" : "Duplicate"}
            </Button>
            {status === "draft" ? (
              <>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/invoices/${invoice.id}/edit`}>
                    <Pencil /> Edit
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
                      <Send /> {pending === "send" ? "Sending…" : "Send invoice"}
                    </Button>
                    <Button
                      data-testid="invoice-mark-sent"
                      disabled={pending !== null}
                      onClick={() => runAction("mark-sent", () => markInvoiceSent(invoice.id))}
                      size="sm"
                      variant="outline"
                    >
                      {pending === "mark-sent" ? "Marking…" : "Mark sent"}
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
                Record payment
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
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.55fr)]">
        <section
          aria-label="Invoice preview"
          className="overflow-hidden rounded-lg border p-4 sm:p-8"
          style={{
            backgroundColor: "var(--paper-2)",
            backgroundImage: "radial-gradient(var(--line) 1px, transparent 1px)",
            backgroundSize: "8px 8px",
          }}
        >
          <div className="invoice-paper relative mx-auto min-h-[720px] max-w-[720px] border p-7 shadow-sm sm:p-12">
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
                    {[business.address, business.city, business.region, business.country]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-3xl font-semibold">
                  {invoice.kind === "credit_note" ? "Credit note" : "Invoice"}
                </p>
                <p className="mt-1 font-mono text-sm text-zinc-500">{invoice.number}</p>
              </div>
            </div>

            <dl className="grid gap-6 border-b py-7 text-sm sm:grid-cols-3">
              <div>
                <dt className="nota-label text-zinc-500">Billed to</dt>
                <dd className="mt-2 font-semibold">
                  {invoice.client.company || invoice.client.name}
                </dd>
                <dd className="mt-1 text-xs leading-relaxed whitespace-pre-line text-zinc-500">
                  {invoice.client.address?.replaceAll(String.raw`\n`, "\n")}
                </dd>
              </div>
              <div>
                <dt className="nota-label text-zinc-500">Issued</dt>
                <dd className="mt-2 font-mono text-xs">{formatDate(invoice.issuedAt)}</dd>
              </div>
              <div>
                <dt className="nota-label text-zinc-500">Due</dt>
                <dd className="mt-2 font-mono text-xs">{formatDate(invoice.dueAt)}</dd>
              </div>
            </dl>

            <div className="py-7">
              <table className="w-full table-fixed text-sm">
                <thead>
                  <tr className="nota-label border-b text-left text-zinc-500">
                    <th className="pb-3 font-medium">Description</th>
                    <th className="w-12 pb-3 text-right font-medium">Qty</th>
                    <th className="w-28 pb-3 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lineItems.map((item) => (
                    <tr className="border-b" key={item.id}>
                      <td className="py-5 pr-4">
                        <span className="font-medium">{item.description}</span>
                        <span className="mt-1 block font-mono text-xs text-zinc-500">
                          {formatCurrency(Number(item.unitPrice), currency)} each
                        </span>
                      </td>
                      <td className="py-5 text-right font-mono text-xs whitespace-nowrap">
                        {item.quantity}
                      </td>
                      <td className="py-5 text-right font-mono text-xs whitespace-nowrap">
                        {formatCurrency(Number(item.amount), currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <dl className="mt-6 ml-auto w-full max-w-64 space-y-2 font-mono text-xs">
                <div className="flex justify-between">
                  <dt className="text-zinc-500">Subtotal</dt>
                  <dd>{formatCurrency(Number(invoice.subtotal), currency)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500">VAT {invoice.taxRate}%</dt>
                  <dd>{formatCurrency(Number(invoice.taxAmount), currency)}</dd>
                </div>
                <div className="mt-3 flex justify-between border-t pt-3 text-sm font-bold">
                  <dt>Total</dt>
                  <dd>{formatCurrency(total, currency)}</dd>
                </div>
              </dl>
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
                <span>{balance > 0 ? `${formatCurrency(balance, currency)} due` : "Settled"}</span>
                <span aria-hidden="true">→</span>
              </div>
            ) : null}
          </div>
        </section>

        <aside aria-label="Invoice details" className="space-y-8">
          <section className="border-b pb-7">
            <p className="nota-label text-muted-foreground">Still owed</p>
            <p className="mt-2 text-4xl font-semibold tabular-nums">
              {formatCurrency(balance, currency)}
            </p>
            <div
              aria-label={`${paidPercent}% paid`}
              className="mt-5 h-2 overflow-hidden rounded-full bg-muted ring-1 ring-border"
              role="img"
            >
              <div className="h-full bg-primary" style={{ width: `${paidPercent}%` }} />
            </div>
            <div className="mt-2 flex justify-between font-mono text-[11px] text-muted-foreground">
              <span>{formatCurrency(paid, currency)} paid</span>
              <span>
                {balance <= 0 || status === "cancelled"
                  ? "Settled"
                  : remainingDays < 0
                    ? `${Math.abs(remainingDays)} days overdue`
                    : remainingDays === 0
                      ? "Due today"
                      : `${remainingDays} days until due`}
              </span>
            </div>
          </section>

          <section className="border-b pb-7">
            <h2 className="nota-label">Client</h2>
            <dl className="mt-4 space-y-4 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Billed to</dt>
                <dd className="mt-1 font-medium">
                  {invoice.client.company || invoice.client.name}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Sent to</dt>
                <dd className="mt-1 break-all">{invoice.client.email}</dd>
              </div>
              {invoice.client.taxIdentifier ? (
                <div>
                  <dt className="text-xs text-muted-foreground">
                    {invoice.client.taxIdentifier.type === "eu_vat"
                      ? "VAT ID"
                      : invoice.client.taxIdentifier.type === "us_ein"
                        ? "EIN"
                        : "Tax ID"}
                  </dt>
                  <dd className="mt-1 flex items-center gap-1.5 font-mono text-xs">
                    {invoice.client.taxIdentifier.value}
                    {invoice.client.taxIdentifier.type === "eu_vat" &&
                    invoice.client.vatStatus === "valid" ? (
                      <BadgeCheck aria-label="Verified" className="size-4 text-emerald-600" />
                    ) : null}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="text-xs text-muted-foreground">Tax rule</dt>
                <dd className="mt-1">
                  {invoice.reverseCharge === "true" ? "Reverse charge" : `VAT ${invoice.taxRate}%`}
                </dd>
              </div>
            </dl>
          </section>

          <section>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="nota-label">What happened</h2>
              {invoice.viewCount > 0 ? (
                <span className="font-mono text-[11px] text-muted-foreground">
                  {invoice.viewCount} {invoice.viewCount === 1 ? "open" : "opens"}
                </span>
              ) : null}
            </div>
            {activities.length ? (
              <ol className="mt-5 space-y-5">
                {activities.map((activity) => (
                  <li className="grid grid-cols-[8px_1fr] gap-3" key={activity.id}>
                    <span className="mt-1.5 size-2 rounded-full bg-foreground" />
                    <div>
                      <p className="text-sm">{activityText(activity, currency)}</p>
                      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                        {formatDate(activity.createdAt)} · via {sourceLabel(activity)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">No activity yet.</p>
            )}
            {(status === "sent" || status === "overdue") && canSendInvoiceReminder(role) ? (
              <Button
                className="mt-6"
                disabled={pending !== null}
                onClick={() => runAction("reminder", () => sendReminder(invoice.id))}
                size="sm"
                variant="outline"
              >
                {pending === "reminder" ? "Sending…" : "Send reminder"}
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
                {pending === "delete" ? "Deleting…" : "Delete draft"}
              </Button>
            ) : canCancelInvoice(role) && canCancelStatus(status) ? (
              <Button
                className="mt-3 text-destructive"
                disabled={pending !== null}
                onClick={() => handleDestructiveAction("cancel")}
                size="sm"
                variant="ghost"
              >
                {pending === "cancel" ? "Cancelling…" : "Cancel invoice"}
              </Button>
            ) : null}
          </section>
        </aside>
      </div>

      <Dialog onOpenChange={setPaymentOpen} open={paymentOpen}>
        <DialogContent>
          <form onSubmit={handlePayment}>
            <DialogHeader>
              <DialogTitle>Record payment</DialogTitle>
              <DialogDescription>
                The amount defaults to the outstanding balance. Enter a lower amount to record a
                partial payment.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-5 py-6">
              <div className="grid gap-2">
                <Label htmlFor="payment-amount">Amount ({currency})</Label>
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
                <Label htmlFor="payment-method">Method</Label>
                <Select
                  onValueChange={(value: "bank_transfer" | "other") => setPaymentMethod(value)}
                  value={paymentMethod}
                >
                  <SelectTrigger className="w-full" id="payment-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="payment-note">
                  Note <span className="font-normal text-muted-foreground">(optional)</span>
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
                Cancel
              </Button>
              <Button
                data-testid="invoice-payment-submit"
                disabled={pending === "payment"}
                type="submit"
              >
                {pending === "payment" ? "Recording…" : "Record payment"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </article>
  );
}
