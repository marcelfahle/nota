export type InvoiceLifecycleStatus = "cancelled" | "draft" | "overdue" | "paid" | "sent";

export function normalizeInvoiceStatus(status: string | null | undefined): InvoiceLifecycleStatus {
  switch (status) {
    case "cancelled":
    case "draft":
    case "overdue":
    case "paid":
    case "sent":
      return status;
    default:
      return "draft";
  }
}

export function canEditInvoice(status: string | null | undefined) {
  return normalizeInvoiceStatus(status) === "draft";
}

export function canDeleteInvoice(status: string | null | undefined) {
  return normalizeInvoiceStatus(status) === "draft";
}

export function canSendInvoice(status: string | null | undefined) {
  return normalizeInvoiceStatus(status) === "draft";
}

export function canCancelInvoice(status: string | null | undefined) {
  const normalized = normalizeInvoiceStatus(status);
  return normalized === "sent" || normalized === "overdue";
}

export function canMarkInvoicePaid(status: string | null | undefined) {
  const normalized = normalizeInvoiceStatus(status);
  return normalized !== "paid" && normalized !== "cancelled";
}

export function canSendInvoiceReminder(
  status: string | null | undefined,
  hasStripePaymentLink: boolean,
) {
  const normalized = normalizeInvoiceStatus(status);
  return hasStripePaymentLink && (normalized === "sent" || normalized === "overdue");
}

export function isInvoiceSendFinalized(
  status: string | null | undefined,
  hasSentActivity: boolean,
  hasStripePaymentLink: boolean,
) {
  return normalizeInvoiceStatus(status) === "sent" && hasSentActivity && hasStripePaymentLink;
}
