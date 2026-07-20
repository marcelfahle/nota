"use client";

import {
  CheckCircle2,
  Copy,
  Download,
  FileCode2,
  Mail,
  MoreHorizontal,
  Pencil,
  Send,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  duplicateInvoice,
  markInvoicePaid,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AuthenticatedRole } from "@/lib/auth";
import {
  canMarkInvoicePaid as canMarkInvoicePaidStatus,
  canSendInvoiceReminder as canSendInvoiceReminderStatus,
  normalizeInvoiceStatus,
} from "@/lib/invoice-lifecycle";
import {
  canMarkInvoicePaid as canMarkInvoicePaidRole,
  canSendInvoice as canSendInvoiceRole,
  canSendInvoiceReminder as canSendInvoiceReminderRole,
} from "@/lib/roles";

type ConfirmAction = "mark-paid" | "remind" | "send";

type InvoiceRowActionsProps = {
  invoice: {
    id: string;
    number: string;
    status: string | null;
    stripePaymentLinkUrl: string | null;
  };
  role: AuthenticatedRole;
};

const CONFIRM_COPY: Record<
  ConfirmAction,
  {
    confirmLabel: string;
    description: (invoiceNumber: string) => string;
    title: string;
  }
> = {
  "mark-paid": {
    confirmLabel: "Mark as paid",
    description: (invoiceNumber) =>
      `This records ${invoiceNumber} as paid and removes it from outstanding balances.`,
    title: "Record payment?",
  },
  remind: {
    confirmLabel: "Send reminder",
    description: (invoiceNumber) =>
      `Nota will email a payment reminder for ${invoiceNumber} to the client.`,
    title: "Send payment reminder?",
  },
  send: {
    confirmLabel: "Send invoice",
    description: (invoiceNumber) =>
      `Nota will email ${invoiceNumber} to the client and create its payment link.`,
    title: "Send this invoice?",
  },
};

function getPrimaryAction(
  status: ReturnType<typeof normalizeInvoiceStatus>,
  canSend: boolean,
  canMarkPaid: boolean,
): ConfirmAction | "edit" | null {
  if (canSend) {
    return "send";
  }
  if (status === "draft") {
    return "edit";
  }
  if (canMarkPaid) {
    return "mark-paid";
  }
  return null;
}

function runInvoiceAction(action: ConfirmAction, invoiceId: string) {
  if (action === "send") {
    return sendInvoice(invoiceId);
  }
  if (action === "remind") {
    return sendReminder(invoiceId);
  }
  return markInvoicePaid(invoiceId);
}

export function InvoiceRowActions({ invoice, role }: InvoiceRowActionsProps) {
  const router = useRouter();
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const status = normalizeInvoiceStatus(invoice.status);

  const canSend = status === "draft" && canSendInvoiceRole(role);
  const canMarkPaid =
    canMarkInvoicePaidRole(role) && canMarkInvoicePaidStatus(status);
  const canRemind =
    canSendInvoiceReminderRole(role) &&
    canSendInvoiceReminderStatus(status, Boolean(invoice.stripePaymentLinkUrl));
  const primaryAction = getPrimaryAction(status, canSend, canMarkPaid);

  async function runConfirmedAction() {
    if (!confirmAction) {
      return;
    }

    setPendingAction(confirmAction);
    setError(null);
    try {
      const result = await runInvoiceAction(confirmAction, invoice.id);

      if (result?.error) {
        setError(result.error);
        return;
      }

      setConfirmAction(null);
      router.refresh();
    } catch {
      setError("That action did not finish. Please try again.");
    } finally {
      setPendingAction(null);
    }
  }

  async function handleDuplicate() {
    setPendingAction("duplicate");
    setError(null);
    try {
      const newId = await duplicateInvoice(invoice.id);
      if (!/^[0-9a-f-]{36}$/i.test(newId)) {
        setError(newId || "Invoice could not be duplicated");
        return;
      }

      router.push(`/invoices/${newId}`);
    } catch {
      setError("Invoice could not be duplicated. Please try again.");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <>
      <div>
        <div
          className="flex items-center justify-end gap-1"
          data-testid={`invoice-actions-${invoice.id}`}
        >
          {primaryAction === "edit" ? (
            <Button
              asChild
              className="min-h-11 sm:min-h-8"
              size="sm"
              variant="ghost"
            >
              <Link href={`/invoices/${invoice.id}/edit`}>
                <Pencil />
                Edit
              </Link>
            </Button>
          ) : primaryAction ? (
            <Button
              className="min-h-11 sm:min-h-8"
              disabled={pendingAction !== null}
              onClick={() => setConfirmAction(primaryAction)}
              size="sm"
              variant="ghost"
            >
              {primaryAction === "send" ? <Send /> : <CheckCircle2 />}
              {primaryAction === "send" ? "Send" : "Mark paid"}
            </Button>
          ) : null}

          <Button
            aria-label={`Download ${invoice.number} PDF`}
            asChild
            className="min-h-11 px-2.5 sm:min-h-8"
            size="sm"
            variant="ghost"
          >
            <a href={`/api/invoices/${invoice.id}/pdf`}>
              <Download />
              <span className="sr-only sm:not-sr-only">PDF</span>
            </a>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label={`More actions for ${invoice.number}`}
                className="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8"
                disabled={pendingAction !== null}
                size="icon-sm"
                variant="ghost"
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="font-mono text-xs text-zinc-500">
                {invoice.number}
              </DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <Link href={`/invoices/${invoice.id}`}>View invoice</Link>
              </DropdownMenuItem>
              {status === "draft" && (
                <DropdownMenuItem asChild>
                  <Link href={`/invoices/${invoice.id}/edit`}>
                    <Pencil />
                    Edit draft
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild>
                <a href={`/api/invoices/${invoice.id}/pdf`}>
                  <Download />
                  Download PDF
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={`/api/invoices/${invoice.id}/xrechnung`}>
                  <FileCode2 />
                  Download XRechnung
                </a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {canRemind && (
                <DropdownMenuItem onSelect={() => setConfirmAction("remind")}>
                  <Mail />
                  Send reminder
                </DropdownMenuItem>
              )}
              {canMarkPaid && primaryAction !== "mark-paid" && (
                <DropdownMenuItem
                  onSelect={() => setConfirmAction("mark-paid")}
                >
                  <CheckCircle2 />
                  Mark as paid
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={handleDuplicate}>
                <Copy />
                Duplicate as draft
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {error && !confirmAction ? (
          <p className="mt-1 text-right text-xs text-red-600" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <Dialog
        onOpenChange={(open) => {
          if (!open && pendingAction === null) {
            setConfirmAction(null);
            setError(null);
          }
        }}
        open={confirmAction !== null}
      >
        <DialogContent>
          {confirmAction ? (
            <>
              <DialogHeader>
                <DialogTitle>{CONFIRM_COPY[confirmAction].title}</DialogTitle>
                <DialogDescription>
                  {CONFIRM_COPY[confirmAction].description(invoice.number)}
                </DialogDescription>
              </DialogHeader>
              {error ? (
                <p
                  className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}
              <DialogFooter>
                <Button
                  disabled={pendingAction !== null}
                  onClick={() => setConfirmAction(null)}
                  variant="outline"
                >
                  Review invoice
                </Button>
                <Button
                  disabled={pendingAction !== null}
                  onClick={runConfirmedAction}
                >
                  {pendingAction === confirmAction
                    ? "Working…"
                    : CONFIRM_COPY[confirmAction].confirmLabel}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
