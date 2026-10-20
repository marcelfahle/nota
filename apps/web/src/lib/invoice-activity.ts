import { parseInvoiceAttachments } from "@/lib/e-invoice-delivery";
import { formatCurrency } from "@/lib/utils";

export type InvoiceActivity = {
  action: string;
  metadata: unknown;
};

const ACTIVITY_LABELS: Record<string, string> = {
  cancelled: "Invoice cancelled",
  created: "Invoice created",
  credited: "Credit note issued",
  marked_overdue: "Invoice marked overdue",
  paid: "Payment recorded",
  reminder_sent: "Payment reminder sent",
  sent: "Invoice sent",
  viewed: "Invoice opened",
};

/** The one line the invoice history shows for an activity entry. */
export function invoiceActivityText(activity: InvoiceActivity, currency: string) {
  const metadata =
    activity.metadata && typeof activity.metadata === "object"
      ? (activity.metadata as Record<string, unknown>)
      : null;
  if (activity.action === "paid" && typeof metadata?.amount === "string") {
    return `${formatCurrency(Number(metadata.amount), currency)} payment recorded`;
  }
  if (activity.action === "created" && typeof metadata?.originalNumber === "string") {
    return `Credit note created for ${metadata.originalNumber}`;
  }
  if (activity.action === "credited" && typeof metadata?.creditNoteNumber === "string") {
    return `Credited by ${metadata.creditNoteNumber}`;
  }
  if (activity.action === "sent" && Array.isArray(metadata?.attachments)) {
    return parseInvoiceAttachments(metadata.attachments).includes("xml")
      ? "Sent with PDF and XRechnung XML"
      : "Sent with PDF";
  }
  return ACTIVITY_LABELS[activity.action] ?? activity.action.replaceAll("_", " ");
}
