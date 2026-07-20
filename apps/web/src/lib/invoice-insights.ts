import {
  normalizeInvoiceStatus,
  type InvoiceLifecycleStatus,
} from "@/lib/invoice-lifecycle";

export type InvoiceInsightRow = {
  clientId: string | null;
  clientName: string | null;
  currency: string | null;
  dueAt: string;
  issuedAt: string;
  paidAt: Date | string | null;
  status: string | null;
  total: string | null;
};

type ClientCurrencyTotals = {
  clientId: string | null;
  clientName: string;
  invoiceCount: number;
  issued: number;
  outstanding: number;
  overdue: number;
};

type CurrencyAccumulator = {
  averageDaysToPayValues: Array<number>;
  clients: Map<string, ClientCurrencyTotals>;
  cohortCollected: number;
  collected: number;
  currency: string;
  draft: number;
  issued: number;
  issuedInvoiceCount: number;
  outstanding: number;
  overdue: number;
};

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function getAmount(total: string | null) {
  const amount = Number(total ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function daysBetween(from: string, to: Date | string) {
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = typeof to === "string" ? new Date(to) : to;
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return null;
  }

  return Math.max(
    0,
    Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000),
  );
}

function createStatusCounts(): Record<InvoiceLifecycleStatus, number> {
  return { cancelled: 0, draft: 0, overdue: 0, paid: 0, sent: 0 };
}

function createCurrencyAccumulator(currency: string): CurrencyAccumulator {
  return {
    averageDaysToPayValues: [],
    clients: new Map(),
    cohortCollected: 0,
    collected: 0,
    currency,
    draft: 0,
    issued: 0,
    issuedInvoiceCount: 0,
    outstanding: 0,
    overdue: 0,
  };
}

export function summarizeInvoiceRows(
  rows: Array<InvoiceInsightRow>,
  options: { collectionRows?: Array<InvoiceInsightRow> } = {},
) {
  const statusCounts = createStatusCounts();
  const currencies = new Map<string, CurrencyAccumulator>();
  const usesSeparateCollectionRows = options.collectionRows !== undefined;

  for (const row of rows) {
    const status = normalizeInvoiceStatus(row.status);
    const amount = getAmount(row.total);
    const currency = (row.currency || "EUR").toUpperCase();
    const bucket =
      currencies.get(currency) ?? createCurrencyAccumulator(currency);
    currencies.set(currency, bucket);
    statusCounts[status] += 1;

    if (status === "draft") {
      bucket.draft += amount;
      continue;
    }
    if (status === "cancelled") {
      continue;
    }

    bucket.issued += amount;
    bucket.issuedInvoiceCount += 1;

    if (status === "paid") {
      bucket.cohortCollected += amount;
      if (!usesSeparateCollectionRows) {
        bucket.collected += amount;
      }
      if (!usesSeparateCollectionRows && row.paidAt) {
        const paymentDays = daysBetween(row.issuedAt, row.paidAt);
        if (paymentDays !== null) {
          bucket.averageDaysToPayValues.push(paymentDays);
        }
      }
    }
    if (status === "sent" || status === "overdue") {
      bucket.outstanding += amount;
    }
    if (status === "overdue") {
      bucket.overdue += amount;
    }

    const clientKey = row.clientId ?? row.clientName ?? "unknown";
    const client = bucket.clients.get(clientKey) ?? {
      clientId: row.clientId,
      clientName: row.clientName ?? "Unknown client",
      invoiceCount: 0,
      issued: 0,
      outstanding: 0,
      overdue: 0,
    };
    client.invoiceCount += 1;
    client.issued += amount;
    if (status === "sent" || status === "overdue") {
      client.outstanding += amount;
    }
    if (status === "overdue") {
      client.overdue += amount;
    }
    bucket.clients.set(clientKey, client);
  }

  for (const row of options.collectionRows ?? []) {
    if (normalizeInvoiceStatus(row.status) !== "paid" || !row.paidAt) {
      continue;
    }

    const amount = getAmount(row.total);
    const currency = (row.currency || "EUR").toUpperCase();
    const bucket =
      currencies.get(currency) ?? createCurrencyAccumulator(currency);
    currencies.set(currency, bucket);
    bucket.collected += amount;

    const paymentDays = daysBetween(row.issuedAt, row.paidAt);
    if (paymentDays !== null) {
      bucket.averageDaysToPayValues.push(paymentDays);
    }
  }

  return {
    currencies: [...currencies.values()]
      .map((bucket) => ({
        averageDaysToPay:
          bucket.averageDaysToPayValues.length > 0
            ? round(
                bucket.averageDaysToPayValues.reduce(
                  (sum, value) => sum + value,
                  0,
                ) / bucket.averageDaysToPayValues.length,
              )
            : null,
        averageIssuedInvoice:
          bucket.issuedInvoiceCount > 0
            ? round(bucket.issued / bucket.issuedInvoiceCount)
            : 0,
        collected: round(bucket.collected),
        collectionRate:
          bucket.issued > 0
            ? round((bucket.cohortCollected / bucket.issued) * 100)
            : 0,
        currency: bucket.currency,
        draft: round(bucket.draft),
        issued: round(bucket.issued),
        outstanding: round(bucket.outstanding),
        overdue: round(bucket.overdue),
        topClients: [...bucket.clients.values()]
          .sort(
            (a, b) =>
              b.issued - a.issued || a.clientName.localeCompare(b.clientName),
          )
          .slice(0, 5)
          .map((client) => ({
            ...client,
            issued: round(client.issued),
            outstanding: round(client.outstanding),
            overdue: round(client.overdue),
          })),
      }))
      .sort((a, b) => a.currency.localeCompare(b.currency)),
    invoiceCount: rows.length,
    statusCounts,
  };
}
