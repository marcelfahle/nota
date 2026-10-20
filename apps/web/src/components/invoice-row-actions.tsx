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
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  duplicateInvoice,
  markInvoicePaid,
  markInvoiceSent,
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

type ConfirmAction = "mark-paid" | "mark-sent" | "remind" | "send";

type InvoiceRowActionsProps = {
  invoice: {
    id: string;
    number: string;
    status: string | null;
    stripePaymentLinkUrl: string | null;
  };
  role: AuthenticatedRole;
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
  if (action === "mark-sent") {
    return markInvoiceSent(invoiceId);
  }
  if (action === "remind") {
    return sendReminder(invoiceId);
  }
  return markInvoicePaid(invoiceId);
}

export function InvoiceRowActions({ invoice, role }: InvoiceRowActionsProps) {
  const t = useTranslations("invoices.actions");
  const router = useRouter();
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const status = normalizeInvoiceStatus(invoice.status);

  const canSend = status === "draft" && canSendInvoiceRole(role);
  const canMarkPaid = canMarkInvoicePaidRole(role) && canMarkInvoicePaidStatus(status);
  const canRemind = canSendInvoiceReminderRole(role) && canSendInvoiceReminderStatus(status);
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
      setError(t("failed"));
    } finally {
      setPendingAction(null);
    }
  }

  async function handleDuplicate() {
    setPendingAction("duplicate");
    setError(null);
    try {
      const result = await duplicateInvoice(invoice.id);
      if ("error" in result) {
        setError(result.error);
        return;
      }

      router.push(`/invoices/${result.invoiceId}`);
    } catch {
      setError(t("duplicateFailed"));
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
            <Button asChild className="min-h-11 sm:min-h-8" size="sm" variant="ghost">
              <Link href={`/invoices/${invoice.id}/edit`}>
                <Pencil />
                {t("edit")}
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
              {primaryAction === "send" ? t("send") : t("markPaid")}
            </Button>
          ) : null}

          <Button
            aria-label={t("downloadPdfFor", { number: invoice.number })}
            asChild
            className="min-h-11 px-2.5 sm:min-h-8"
            size="sm"
            variant="ghost"
          >
            <a href={`/api/invoices/${invoice.id}/pdf`}>
              <Download />
              <span className="sr-only sm:not-sr-only">{t("pdf")}</span>
            </a>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label={t("moreFor", { number: invoice.number })}
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
                <Link href={`/invoices/${invoice.id}`}>{t("view")}</Link>
              </DropdownMenuItem>
              {status === "draft" && (
                <DropdownMenuItem asChild>
                  <Link href={`/invoices/${invoice.id}/edit`}>
                    <Pencil />
                    {t("editDraft")}
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild>
                <a href={`/api/invoices/${invoice.id}/pdf`}>
                  <Download />
                  {t("downloadPdf")}
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={`/api/invoices/${invoice.id}/xrechnung`}>
                  <FileCode2 />
                  {t("downloadXml")}
                </a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {canRemind && (
                <DropdownMenuItem onSelect={() => setConfirmAction("remind")}>
                  <Mail />
                  {t("sendReminder")}
                </DropdownMenuItem>
              )}
              {canSend && (
                <DropdownMenuItem onSelect={() => setConfirmAction("mark-sent")}>
                  <CheckCircle2 />
                  {t("markSent")}
                </DropdownMenuItem>
              )}
              {canMarkPaid && primaryAction !== "mark-paid" && (
                <DropdownMenuItem onSelect={() => setConfirmAction("mark-paid")}>
                  <CheckCircle2 />
                  {t("markAsPaid")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={handleDuplicate}>
                <Copy />
                {t("duplicate")}
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
                <DialogTitle>{t(`confirm.${confirmAction}.title`)}</DialogTitle>
                <DialogDescription>
                  {t(`confirm.${confirmAction}.description`, { number: invoice.number })}
                </DialogDescription>
              </DialogHeader>
              {error ? (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                  {error}
                </p>
              ) : null}
              <DialogFooter>
                <Button
                  disabled={pendingAction !== null}
                  onClick={() => setConfirmAction(null)}
                  variant="outline"
                >
                  {t("reviewInvoice")}
                </Button>
                <Button disabled={pendingAction !== null} onClick={runConfirmedAction}>
                  {pendingAction === confirmAction
                    ? t("working")
                    : t(`confirm.${confirmAction}.confirm`)}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
