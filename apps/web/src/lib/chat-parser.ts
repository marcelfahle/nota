import type { InvoiceLineItemInput } from "@/lib/invoice-service";

const LINE_ITEM_PARSE_ERROR =
  "Provide line items as an array or as text like 'Development, 40hrs at 120', '2 x Workshop @ 1500', or 'Discovery | 1 | 800'.";

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
      stripped.split(thousandsSeparator).join("").replace(decimalSeparator, "."),
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

  if (fractionalPart.length === 3 && integerPart.replace(/^-/, "").length >= 1) {
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

function parsePipeLineItem(line: string): InvoiceLineItemInput | null {
  const [description, quantity, unitPrice] = line.split("|").map((part) => part.trim());
  if (!description || !quantity || !unitPrice) {
    return null;
  }

  const parsedQuantity = parseNumericToken(quantity);
  const parsedUnitPrice = parseNumericToken(unitPrice);

  if (!parsedQuantity || parsedQuantity <= 0 || parsedUnitPrice === null || parsedUnitPrice < 0) {
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

  if (!parsedQuantity || parsedQuantity <= 0 || parsedUnitPrice === null || parsedUnitPrice < 0) {
    return null;
  }

  return {
    description: description.trim(),
    quantity: parsedQuantity,
    unitPrice: parsedUnitPrice,
  };
}

function parseDescriptionFirstLineItem(line: string): InvoiceLineItemInput | null {
  const match = line.match(
    /^(.+?)(?:,| -)?\s+([\d]+(?:[.,][\d]+)?)\s*(?:x|hrs?|hours?)\s+(?:at|@)\s*([\d.,€$£-]+)$/i,
  );
  if (!match) {
    return null;
  }

  const [, description, quantity, unitPrice] = match;
  const parsedQuantity = parseNumericToken(quantity);
  const parsedUnitPrice = parseNumericToken(unitPrice);

  if (!parsedQuantity || parsedQuantity <= 0 || parsedUnitPrice === null || parsedUnitPrice < 0) {
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

export function resolveChatInvoiceLineItems(input: {
  lineItems?: Array<InvoiceLineItemInput>;
  lineItemsText?: string;
}) {
  if (input.lineItems?.length) {
    return input.lineItems;
  }

  if (!input.lineItemsText?.trim()) {
    throw new Error(LINE_ITEM_PARSE_ERROR);
  }

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

export function getDefaultInvoiceDates(now = new Date()) {
  const issuedAt = formatDateInput(now);
  const dueAtDate = new Date(now);
  dueAtDate.setDate(dueAtDate.getDate() + 30);

  return {
    dueAt: formatDateInput(dueAtDate),
    issuedAt,
  };
}
