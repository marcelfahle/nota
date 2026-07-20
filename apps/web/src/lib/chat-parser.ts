import type { InvoiceLineItemInput } from "@/lib/invoice-service";

export const LINE_ITEM_PARSE_ERROR =
  "Provide line items as an array, a total amount, or text like 'Development, 40hrs at 120', '2 x Workshop @ 1500', or 'Discovery | 1 | 800'.";

const MONTHS = new Map<string, number>([
  ["jan", 0],
  ["january", 0],
  ["feb", 1],
  ["february", 1],
  ["mar", 2],
  ["march", 2],
  ["apr", 3],
  ["april", 3],
  ["may", 4],
  ["jun", 5],
  ["june", 5],
  ["jul", 6],
  ["july", 6],
  ["aug", 7],
  ["august", 7],
  ["sep", 8],
  ["sept", 8],
  ["september", 8],
  ["oct", 9],
  ["october", 9],
  ["nov", 10],
  ["november", 10],
  ["dec", 11],
  ["december", 11],
] as const);

type ResolveChatInvoiceLineItemsInput = {
  fallbackDescription?: string;
  lineItems?: Array<InvoiceLineItemInput>;
  lineItemsText?: string;
  taxRate?: number;
  templateLineItems?: Array<InvoiceLineItemInput>;
  totalAmount?: number;
};

type ResolveChatInvoiceDatesInput = {
  dueAt?: string;
  invoiceMonth?: string;
  issuedAt?: string;
  now?: Date;
};

function normalizeNumberToken(value: string) {
  const stripped = value.replaceAll(/[^0-9,.-]/g, "").trim();
  if (!stripped) {
    return null;
  }

  const lastComma = stripped.lastIndexOf(",");
  const lastDot = stripped.lastIndexOf(".");

  if (lastComma !== -1 && lastDot !== -1) {
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? "." : ",";
    return Number.parseFloat(
      stripped
        .split(thousandsSeparator)
        .join("")
        .replace(decimalSeparator, "."),
    );
  }

  const separator = lastComma !== -1 ? "," : lastDot !== -1 ? "." : null;
  if (!separator) {
    return Number.parseFloat(stripped);
  }

  const parts = stripped.split(separator);
  const fractionalPart = parts.at(-1) ?? "";
  const integerPart = parts.slice(0, -1).join("");

  if (parts.length > 2) {
    if (fractionalPart.length === 3) {
      return Number.parseFloat(parts.join(""));
    }

    return Number.parseFloat(`${integerPart}.${fractionalPart}`);
  }

  if (
    fractionalPart.length === 3 &&
    integerPart.replace(/^-/, "").length >= 1
  ) {
    return Number.parseFloat(`${integerPart}${fractionalPart}`);
  }

  return Number.parseFloat(`${integerPart}.${fractionalPart}`);
}

function parseNumericToken(value: string) {
  const parsed = normalizeNumberToken(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDateInput(date: Date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());

  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function parseDateInput(value: string) {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (
    date.getFullYear() !== Number(year) ||
    date.getMonth() !== Number(month) - 1 ||
    date.getDate() !== Number(day)
  ) {
    return null;
  }

  return date;
}

function parseInvoiceMonth(value: string, now: Date) {
  const normalized = value.trim().toLowerCase();
  const isoMatch = normalized.match(/^(\d{4})-(0?[1-9]|1[0-2])$/);
  if (isoMatch) {
    return {
      monthIndex: Number(isoMatch[2]) - 1,
      year: Number(isoMatch[1]),
    };
  }

  const numericMatch = normalized.match(/^(0?[1-9]|1[0-2])(?:[/-](\d{4}))?$/);
  if (numericMatch) {
    const monthIndex = Number(numericMatch[1]) - 1;
    let year = numericMatch[2] ? Number(numericMatch[2]) : now.getFullYear();
    if (!numericMatch[2] && monthIndex > now.getMonth()) {
      year -= 1;
    }

    return { monthIndex, year };
  }

  const nameMatch = normalized.match(/^([a-z]+)(?:\s+(\d{4}))?$/);
  if (!nameMatch) {
    return null;
  }

  const monthIndex = MONTHS.get(nameMatch[1]);
  if (monthIndex === undefined) {
    return null;
  }

  let year = nameMatch[2] ? Number(nameMatch[2]) : now.getFullYear();
  if (!nameMatch[2] && monthIndex > now.getMonth()) {
    year -= 1;
  }

  return { monthIndex, year };
}

function parsePipeLineItem(line: string): InvoiceLineItemInput | null {
  const [description, quantity, unitPrice] = line
    .split("|")
    .map((part) => part.trim());
  if (!description || !quantity || !unitPrice) {
    return null;
  }

  const parsedQuantity = parseNumericToken(quantity);
  const parsedUnitPrice = parseNumericToken(unitPrice);

  if (
    !parsedQuantity ||
    parsedQuantity <= 0 ||
    parsedUnitPrice === null ||
    parsedUnitPrice < 0
  ) {
    return null;
  }

  return {
    description,
    quantity: parsedQuantity,
    unitPrice: parsedUnitPrice,
  };
}

function parseQuantityFirstLineItem(line: string): InvoiceLineItemInput | null {
  const match = line.match(
    /^([\d]+(?:[.,][\d]+)?)\s*(?:x|hrs?|hours?)\s+(.+?)\s+(?:at|@)\s*([\d.,€$£-]+)$/i,
  );
  if (!match) {
    return null;
  }

  const [, quantity, description, unitPrice] = match;
  const parsedQuantity = parseNumericToken(quantity);
  const parsedUnitPrice = parseNumericToken(unitPrice);

  if (
    !parsedQuantity ||
    parsedQuantity <= 0 ||
    parsedUnitPrice === null ||
    parsedUnitPrice < 0
  ) {
    return null;
  }

  return {
    description: description.trim(),
    quantity: parsedQuantity,
    unitPrice: parsedUnitPrice,
  };
}

function parseDescriptionFirstLineItem(
  line: string,
): InvoiceLineItemInput | null {
  const match = line.match(
    /^(.+?)(?:,| -)?\s+([\d]+(?:[.,][\d]+)?)\s*(?:x|hrs?|hours?)\s+(?:at|@)\s*([\d.,€$£-]+)$/i,
  );
  if (!match) {
    return null;
  }

  const [, description, quantity, unitPrice] = match;
  const parsedQuantity = parseNumericToken(quantity);
  const parsedUnitPrice = parseNumericToken(unitPrice);

  if (
    !parsedQuantity ||
    parsedQuantity <= 0 ||
    parsedUnitPrice === null ||
    parsedUnitPrice < 0
  ) {
    return null;
  }

  return {
    description: description.trim().replace(/[,:-]\s*$/, ""),
    quantity: parsedQuantity,
    unitPrice: parsedUnitPrice,
  };
}

function parseSingleRateLineItem(line: string): InvoiceLineItemInput | null {
  const match = line.match(/^(.+?)\s*(?:at|@)\s*([\d.,€$£-]+)$/i);
  if (!match) {
    return null;
  }

  const [, description, unitPrice] = match;
  const parsedUnitPrice = parseNumericToken(unitPrice);
  if (parsedUnitPrice === null || parsedUnitPrice < 0) {
    return null;
  }

  return {
    description: description.trim().replace(/[,:-]\s*$/, ""),
    quantity: 1,
    unitPrice: parsedUnitPrice,
  };
}

function parseTextLineItem(line: string): InvoiceLineItemInput | null {
  return (
    parsePipeLineItem(line) ??
    parseQuantityFirstLineItem(line) ??
    parseDescriptionFirstLineItem(line) ??
    parseSingleRateLineItem(line)
  );
}

function normalizeTemplateLineItems(items?: Array<InvoiceLineItemInput>) {
  return (
    items
      ?.map((item) => ({
        description: item.description.trim(),
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
      }))
      .filter(
        (item) =>
          item.description &&
          Number.isFinite(item.quantity) &&
          item.quantity > 0 &&
          Number.isFinite(item.unitPrice) &&
          item.unitPrice >= 0,
      ) ?? []
  );
}

function getTargetSubtotal(totalAmount: number, taxRate = 0) {
  return totalAmount / (1 + taxRate / 100);
}

function buildLineItemsFromTotalAmount(
  input: ResolveChatInvoiceLineItemsInput,
) {
  const totalAmount =
    typeof input.totalAmount === "number" && Number.isFinite(input.totalAmount)
      ? input.totalAmount
      : null;
  if (!totalAmount || totalAmount <= 0) {
    return null;
  }

  const targetSubtotal = getTargetSubtotal(totalAmount, input.taxRate ?? 0);
  const templateLineItems = normalizeTemplateLineItems(input.templateLineItems);

  if (templateLineItems.length > 0) {
    const templateSubtotal = templateLineItems.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0,
    );

    if (templateSubtotal > 0) {
      const scale = targetSubtotal / templateSubtotal;
      return templateLineItems.map((item) => ({
        ...item,
        unitPrice: item.unitPrice * scale,
      }));
    }
  }

  return [
    {
      description:
        input.fallbackDescription?.trim() ||
        templateLineItems[0]?.description ||
        "Services",
      quantity: 1,
      unitPrice: targetSubtotal,
    },
  ];
}

export function isChatInvoiceLineItemParseError(error: unknown) {
  return error instanceof Error && error.message === LINE_ITEM_PARSE_ERROR;
}

export function resolveChatInvoiceLineItems(
  input: ResolveChatInvoiceLineItemsInput,
) {
  if (input.lineItems?.length) {
    return input.lineItems;
  }

  if (input.lineItemsText?.trim()) {
    const rows = input.lineItemsText
      .split(/\r?\n|;/)
      .map((row) => row.trim())
      .filter(Boolean);

    if (rows.length === 0) {
      throw new Error(LINE_ITEM_PARSE_ERROR);
    }

    const parsed = rows.map((row) => parseTextLineItem(row));
    if (parsed.some((item) => item === null)) {
      throw new Error(LINE_ITEM_PARSE_ERROR);
    }

    return parsed.filter((item): item is InvoiceLineItemInput => item !== null);
  }

  const amountLineItems = buildLineItemsFromTotalAmount(input);
  if (amountLineItems) {
    return amountLineItems;
  }

  const templateLineItems = normalizeTemplateLineItems(input.templateLineItems);
  if (templateLineItems.length > 0) {
    return templateLineItems;
  }

  throw new Error(LINE_ITEM_PARSE_ERROR);
}

export function getDefaultInvoiceDates(now = new Date()) {
  const issuedAt = formatDateInput(now);
  const dueAtDate = new Date(now);
  dueAtDate.setDate(dueAtDate.getDate() + 30);

  return {
    dueAt: formatDateInput(dueAtDate),
    issuedAt,
  };
}

export function resolveChatInvoiceDates({
  dueAt,
  invoiceMonth,
  issuedAt,
  now = new Date(),
}: ResolveChatInvoiceDatesInput) {
  const explicitDueAt = dueAt?.trim();
  const explicitIssuedAt = issuedAt?.trim();

  if (explicitIssuedAt) {
    const issuedAtDate = parseDateInput(explicitIssuedAt) ?? now;
    return {
      dueAt: explicitDueAt || formatDateInput(addDays(issuedAtDate, 30)),
      issuedAt: explicitIssuedAt,
    };
  }

  if (invoiceMonth?.trim()) {
    const parsedMonth = parseInvoiceMonth(invoiceMonth, now);
    if (parsedMonth) {
      const issuedAtDate = new Date(
        parsedMonth.year,
        parsedMonth.monthIndex + 1,
        0,
      );
      return {
        dueAt: explicitDueAt || formatDateInput(addDays(issuedAtDate, 30)),
        issuedAt: formatDateInput(issuedAtDate),
      };
    }
  }

  const defaults = getDefaultInvoiceDates(now);
  return {
    dueAt: explicitDueAt || defaults.dueAt,
    issuedAt: defaults.issuedAt,
  };
}
