"use client";

import { ArrowLeft, Copy, Download, Mail, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { deleteInvoice, duplicateInvoice, sendInvoice } from "@/actions/invoices";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";

type LineItem = {
  amount: string;
  description: string;
  id: string;
  quantity: string;
  sortOrder: number | null;
  unitPrice: string;
};

type ActivityEntry = {
  action: string;
  createdAt: string;
  id: string;
};

type InvoiceDetailProps = {
  activities: Array<ActivityEntry>;
  invoice: {
    client: { email: string; name: string };
    currency: string | null;
    dueAt: string;
    id: string;
    internalNotes: string | null;
    issuedAt: string;
    lineItems: Array<LineItem>;
    notes: string | null;
    number: string;
    paidAt: string | null;
    reverseCharge: string | null;
    status: string | null;
    stripePaymentLinkUrl: string | null;
    subtotal: string | null;
    taxAmount: string | null;
    taxRate: string | null;
    total: string | null;
  };
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const ACTION_LABELS: Record<string, string> = {
  created: "Invoice created",
  marked_overdue: "Marked overdue",
  paid: "Payment received",
  reminder_sent: "Reminder sent",
  sent: "Invoice sent",
};

export function InvoiceDetailView({ activities, invoice }: InvoiceDetailProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [sending, setSending] = useState(false);
  const router = useRouter();

  const currency = invoice.currency ?? "EUR";
  const status = invoice.status ?? "draft";

  async function handleDelete() {
    setDeleting(true);
    await deleteInvoice(invoice.id);
    router.push("/invoices");
  }

  async function handleSend() {
    setSending(true);
    await sendInvoice(invoice.id);
    router.refresh();
    setSending(false);
  }

  async function handleDuplicate() {
    setDuplicating(true);
    const newId = await duplicateInvoice(invoice.id);
    router.push(`/invoices/${newId}`);
  }

  return (
    <div>
      <Link
        className="mb-6 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"
        href="/invoices"
      >
        <ArrowLeft className="size-4" />
        Back to invoices
      </Link>

      {/* Header */}
      <div className="mb-8">
        <div className="mb-4">
          <div className="mb-1 flex items-center gap-3">
            <h1 className="font-mono text-lg font-semibold">{invoice.number}</h1>
            <StatusBadge status={status} />
          </div>
          <p className="text-sm text-zinc-500">
            {invoice.client.name} &middot; {invoice.client.email}
          </p>
          <p className="mt-2 text-3xl font-semibold">
            {formatCurrency(Number(invoice.total ?? 0), currency)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {status === "draft" && (
            <>
              <Button disabled={sending} onClick={handleSend} size="sm" variant="outline">
                <Mail className="size-4" />
                {sending ? "Sending..." : "Send Invoice"}
              </Button>
              <Link href={`/invoices/${invoice.id}/edit`}>
                <Button size="sm" variant="outline">
                  <Pencil className="size-4" />
                  Edit
                </Button>
              </Link>
            </>
          )}
          {status === "sent" && (
            <Button disabled size="sm" variant="outline">
              <Mail className="size-4" />
              Send Reminder
            </Button>
          )}
          {status === "overdue" && (
            <Button disabled size="sm" variant="outline">
              <Mail className="size-4" />
              Send Overdue Notice
            </Button>
          )}
          <a href={`/api/invoices/${invoice.id}/pdf`} rel="noopener noreferrer" target="_blank">
            <Button size="sm" variant="outline">
              <Download className="size-4" />
              Download PDF
            </Button>
          </a>
          <Button disabled={duplicating} onClick={handleDuplicate} size="sm" variant="outline">
            <Copy className="size-4" />
            {duplicating ? "Duplicating..." : "Duplicate"}
          </Button>
          <Button
            className="text-red-600 hover:bg-red-50 hover:text-red-700"
            onClick={() => setDeleteOpen(true)}
            size="sm"
            variant="outline"
          >
            <Trash2 className="size-4" />
            Delete
          </Button>
        </div>
      </div>

      {/* Stripe Payment Link Indicator */}
      {status === "sent" && invoice.stripePaymentLinkUrl && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          <Copy className="size-4" />
          <span>Stripe payment link active</span>
          <a
            className="ml-auto text-xs underline"
            href={invoice.stripePaymentLinkUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            Open link
          </a>
        </div>
      )}

      {/* Invoice Details Grid */}
      <div className="mb-8 grid max-w-2xl gap-4 sm:grid-cols-3">
        <DetailItem label="Issue Date" value={formatDate(invoice.issuedAt)} />
        <DetailItem label="Due Date" value={formatDate(invoice.dueAt)} />
        {invoice.paidAt ? (
          <DetailItem label="Paid Date" value={formatDate(invoice.paidAt)} />
        ) : (
          <DetailItem label="Currency" value={currency} />
        )}
      </div>

      {invoice.reverseCharge === "true" && (
        <p className="mb-6 text-xs font-medium text-zinc-500">
          Reverse charge — VAT not applicable
        </p>
      )}

      {/* Line Items */}
      <div className="mb-8">
        <h2 className="mb-4 text-sm font-semibold">Line Items</h2>
        <div className="overflow-x-auto rounded-lg border border-zinc-200">
          <table className="w-full min-w-[400px]">
            <thead>
              <tr className="border-b border-zinc-100 text-left text-xs font-medium tracking-wide text-zinc-400 uppercase">
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Rate</th>
                <th className="px-4 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {invoice.lineItems.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 text-sm text-zinc-900">{item.description}</td>
                  <td className="px-4 py-3 text-right text-sm text-zinc-600">{item.quantity}</td>
                  <td className="px-4 py-3 text-right text-sm text-zinc-600">
                    {formatCurrency(Number(item.unitPrice), currency)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-zinc-900">
                    {formatCurrency(Number(item.amount), currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="border-t border-zinc-200 px-4 py-3">
            <div className="flex flex-col items-end gap-1">
              <div className="flex w-48 justify-between text-sm">
                <span className="text-zinc-500">Subtotal</span>
                <span className="font-medium">
                  {formatCurrency(Number(invoice.subtotal ?? 0), currency)}
                </span>
              </div>
              {Number(invoice.taxRate ?? 0) > 0 && (
                <div className="flex w-48 justify-between text-sm">
                  <span className="text-zinc-500">Tax ({invoice.taxRate}%)</span>
                  <span className="font-medium">
                    {formatCurrency(Number(invoice.taxAmount ?? 0), currency)}
                  </span>
                </div>
              )}
              <div className="mt-1 flex w-48 justify-between border-t border-zinc-200 pt-2 text-sm">
                <span className="font-semibold">Total</span>
                <span className="font-semibold">
                  {formatCurrency(Number(invoice.total ?? 0), currency)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Notes */}
      {(invoice.notes || invoice.internalNotes) && (
        <div className="mb-8 grid max-w-2xl gap-4 sm:grid-cols-2">
          {invoice.notes && <DetailItem label="Notes" value={invoice.notes} />}
          {invoice.internalNotes && (
            <DetailItem label="Internal Notes" value={invoice.internalNotes} />
          )}
        </div>
      )}

      {/* Activity Log */}
      {activities.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-4 text-sm font-semibold">Activity</h2>
          <div className="relative pl-6">
            {activities.map((activity, i) => (
              <div className="relative pb-4 last:pb-0" key={activity.id}>
                {/* Vertical line */}
                {i < activities.length - 1 && (
                  <div className="absolute top-2 left-[-17px] h-full w-px bg-zinc-200" />
                )}
                {/* Dot */}
                <div className="absolute top-1.5 left-[-20px] size-[7px] rounded-full bg-zinc-400" />
                <p className="text-sm text-zinc-900">
                  {ACTION_LABELS[activity.action] ?? activity.action}
                </p>
                <p className="text-xs text-zinc-400">{formatDate(activity.createdAt)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog onOpenChange={setDeleteOpen} open={deleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete invoice</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete invoice {invoice.number}? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button disabled={deleting} onClick={() => setDeleteOpen(false)} variant="outline">
              Cancel
            </Button>
            <Button disabled={deleting} onClick={handleDelete} variant="destructive">
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-zinc-400">{label}</p>
      <p className="mt-1 text-sm text-zinc-900">{value}</p>
    </div>
  );
}
