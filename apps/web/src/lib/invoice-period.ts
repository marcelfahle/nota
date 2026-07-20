export const INVOICE_PERIOD_KEYS = [
  "all",
  "this_quarter",
  "last_quarter",
  "year_to_date",
  "last_12_months",
  "custom",
] as const;

export type InvoicePeriodKey = (typeof INVOICE_PERIOD_KEYS)[number];

export type InvoicePeriod = {
  from: string | null;
  key: InvoicePeriodKey;
  label: string;
  to: string | null;
};

type InvoicePeriodInput = {
  from?: string | null;
  period?: InvoicePeriodKey | null;
  to?: string | null;
};

type ArchiveUrlInput = InvoicePeriodInput & {
  clientId?: string | null;
  status?: string | null;
};

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function utcDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day));
}

function parseIsoDate(value: string, field: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${field} must use YYYY-MM-DD format`);
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || toIsoDate(date) !== value) {
    throw new Error(`${field} must be a valid date`);
  }

  return date;
}

function formatMonthDay(date: Date) {
  return `${date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })} ${date.getUTCDate()}`;
}

function formatRangeLabel(from: Date, to: Date) {
  const fromYear = from.getUTCFullYear();
  const toYear = to.getUTCFullYear();
  const fromLabel = formatMonthDay(from);
  const toLabel = formatMonthDay(to);

  if (fromYear === toYear) {
    if (from.getUTCMonth() === to.getUTCMonth()) {
      return `${fromLabel}–${to.getUTCDate()}, ${toYear}`;
    }

    return `${fromLabel}–${toLabel}, ${toYear}`;
  }

  return `${fromLabel}, ${fromYear}–${toLabel}, ${toYear}`;
}

function getQuarter(date: Date) {
  return Math.floor(date.getUTCMonth() / 3) + 1;
}

function getQuarterRange(year: number, quarter: number) {
  const startMonth = (quarter - 1) * 3;
  return {
    from: utcDate(year, startMonth, 1),
    to: utcDate(year, startMonth + 3, 0),
  };
}

export function isInvoicePeriodKey(
  value: string | null | undefined,
): value is InvoicePeriodKey {
  return INVOICE_PERIOD_KEYS.includes(value as InvoicePeriodKey);
}

export function resolveInvoicePeriod(
  input: InvoicePeriodInput = {},
  now = new Date(),
): InvoicePeriod {
  const inferredPeriod = input.from || input.to ? "custom" : "all";
  const period = input.period ?? inferredPeriod;
  const today = utcDate(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );

  if (period === "all") {
    return { from: null, key: period, label: "All invoices", to: null };
  }

  if (period === "custom") {
    if (!input.from || !input.to) {
      throw new Error("Custom periods need both a start date and an end date");
    }

    const from = parseIsoDate(input.from, "The start date");
    const to = parseIsoDate(input.to, "The end date");
    if (from > to) {
      throw new Error("The start date must be on or before the end date");
    }

    return {
      from: toIsoDate(from),
      key: period,
      label: formatRangeLabel(from, to),
      to: toIsoDate(to),
    };
  }

  if (period === "year_to_date") {
    return {
      from: `${today.getUTCFullYear()}-01-01`,
      key: period,
      label: `${today.getUTCFullYear()} year to date`,
      to: toIsoDate(today),
    };
  }

  if (period === "last_12_months") {
    const from = utcDate(today.getUTCFullYear(), today.getUTCMonth() - 11, 1);
    return {
      from: toIsoDate(from),
      key: period,
      label: "Last 12 months",
      to: toIsoDate(today),
    };
  }

  let year = today.getUTCFullYear();
  let quarter = getQuarter(today);
  if (period === "last_quarter") {
    quarter -= 1;
    if (quarter === 0) {
      quarter = 4;
      year -= 1;
    }
  }

  const range = getQuarterRange(year, quarter);
  return {
    from: toIsoDate(range.from),
    key: period,
    label: `Q${quarter} ${year}`,
    to: toIsoDate(range.to),
  };
}

export function getPreviousInvoicePeriod(
  period: InvoicePeriod,
): InvoicePeriod | null {
  if (!period.from || !period.to) {
    return null;
  }

  const from = parseIsoDate(period.from, "The start date");
  const to = parseIsoDate(period.to, "The end date");

  if (period.key === "this_quarter" || period.key === "last_quarter") {
    const previousQuarterDate = new Date(from.getTime() - 86_400_000);
    const previousRange = getQuarterRange(
      previousQuarterDate.getUTCFullYear(),
      getQuarter(previousQuarterDate),
    );
    return {
      from: toIsoDate(previousRange.from),
      key: "custom",
      label: formatRangeLabel(previousRange.from, previousRange.to),
      to: toIsoDate(previousRange.to),
    };
  }

  if (period.key === "year_to_date") {
    const previousFrom = utcDate(
      from.getUTCFullYear() - 1,
      from.getUTCMonth(),
      from.getUTCDate(),
    );
    const previousTo = utcDate(
      to.getUTCFullYear() - 1,
      to.getUTCMonth(),
      to.getUTCDate(),
    );
    return {
      from: toIsoDate(previousFrom),
      key: "custom",
      label: formatRangeLabel(previousFrom, previousTo),
      to: toIsoDate(previousTo),
    };
  }

  const durationMs = to.getTime() - from.getTime();
  const previousTo = new Date(from.getTime() - 86_400_000);
  const previousFrom = new Date(previousTo.getTime() - durationMs);

  return {
    from: toIsoDate(previousFrom),
    key: "custom",
    label: formatRangeLabel(previousFrom, previousTo),
    to: toIsoDate(previousTo),
  };
}

function safeFilenamePart(value: string, lowercase = false) {
  const normalized = value
    .normalize("NFKD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .replaceAll(/[/\\]+/g, "-")
    .replaceAll(/[^a-zA-Z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .slice(0, 48);

  return lowercase ? normalized.toLowerCase() : normalized;
}

function getArchivePeriodToken(period: InvoicePeriod) {
  if (!period.from || !period.to) {
    return "all";
  }

  if (period.key === "this_quarter" || period.key === "last_quarter") {
    const from = parseIsoDate(period.from, "The start date");
    return `${from.getUTCFullYear()}-Q${getQuarter(from)}`;
  }

  if (period.key === "year_to_date") {
    return `${period.from.slice(0, 4)}-YTD`;
  }

  return `${period.from}_to_${period.to}`;
}

export function buildInvoiceArchiveFilename(
  period: InvoicePeriod,
  filters: { clientName?: string | null; status?: string | null } = {},
) {
  const parts = ["nota-invoices", getArchivePeriodToken(period)];
  if (filters.clientName) {
    parts.push(safeFilenamePart(filters.clientName, true));
  }
  if (filters.status) {
    parts.push(safeFilenamePart(filters.status, true));
  }

  return `${parts.filter(Boolean).join("_")}.zip`;
}

export function buildInvoicePdfFilename(input: {
  clientName: string;
  issuedAt: string;
  number: string;
}) {
  const issuedAt = /^\d{4}-\d{2}-\d{2}$/.test(input.issuedAt)
    ? input.issuedAt
    : "invoice";
  const number = safeFilenamePart(input.number) || "invoice";
  const clientName = safeFilenamePart(input.clientName) || "client";
  return `${issuedAt}_${number}_${clientName}.pdf`;
}

export function getUniqueInvoiceArchiveEntryName(
  filename: string,
  usedNames: Set<string>,
) {
  if (!usedNames.has(filename)) {
    usedNames.add(filename);
    return filename;
  }

  const extensionIndex = filename.lastIndexOf(".");
  const basename =
    extensionIndex > 0 ? filename.slice(0, extensionIndex) : filename;
  const extension = extensionIndex > 0 ? filename.slice(extensionIndex) : "";
  let suffix = 2;
  let candidate = `${basename}_${suffix}${extension}`;
  while (usedNames.has(candidate)) {
    suffix += 1;
    candidate = `${basename}_${suffix}${extension}`;
  }

  usedNames.add(candidate);
  return candidate;
}

export function buildInvoiceArchiveUrl(input: ArchiveUrlInput) {
  const params = new URLSearchParams();
  const period = input.period ?? (input.from || input.to ? "custom" : "all");
  params.set("period", period);
  if (input.from) {
    params.set("from", input.from);
  }
  if (input.to) {
    params.set("to", input.to);
  }
  if (input.status) {
    params.set("status", input.status);
  }
  if (input.clientId) {
    params.set("client_id", input.clientId);
  }

  return `/api/invoices/archive?${params.toString()}`;
}
