import { formatCurrency } from "@/lib/utils";

type InvoiceListStatusInput = {
  balance: string;
  openCount: number;
  paidAmount: string;
  status: string | null;
};

type InvoiceSearchInput = {
  clientName: string | null;
  currency: string | null;
  number: string;
  total: string | null;
};

export function getInvoiceListStatus(invoice: InvoiceListStatusInput) {
  if (Number(invoice.paidAmount) > 0 && Number(invoice.balance) > 0) {
    return "part_paid";
  }
  if (invoice.status === "sent" && invoice.openCount > 0) {
    return "opened";
  }
  return invoice.status ?? "draft";
}

export function formatInvoiceDueDate(date: string, status: string | null, today = new Date()) {
  if (status === "overdue") {
    const due = Date.parse(`${date}T00:00:00Z`);
    const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const days = Math.floor((todayUtc - due) / 86_400_000);
    if (days > 0) {
      return `${days} day${days === 1 ? "" : "s"} ago`;
    }
  }

  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function matchesInvoiceSearch(invoice: InvoiceSearchInput, query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) {
    return true;
  }

  const total = Number(invoice.total ?? 0);
  return [
    invoice.clientName,
    invoice.number,
    String(total),
    total.toFixed(2),
    formatCurrency(total, invoice.currency ?? "EUR"),
  ].some((value) => value?.toLocaleLowerCase().includes(normalized));
}
