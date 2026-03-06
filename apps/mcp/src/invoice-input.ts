import type { InvoiceLineItemInput } from "./client.js";

const structuredLineItemSchemaError =
  "Provide line items as an array or newline-separated text like 'Design work | 2 | 500' or '2 x Design work @ 500'.";

function normalizeNumericToken(value: string) {
  const stripped = value.replace(/[^0-9,.-]/g, "").trim();
  if (!stripped) {
    return null;
  }

  const lastComma = stripped.lastIndexOf(",");
  const lastDot = stripped.lastIndexOf(".");

  if (lastComma !== -1 && lastDot !== -1) {
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? "." : ",";
    const normalized = stripped.split(thousandsSeparator).join("").replace(decimalSeparator, ".");
    return Number.parseFloat(normalized);
  }

  const separator = lastComma !== -1 ? "," : lastDot !== -1 ? "." : null;
  if (!separator) {
    return Number.parseFloat(stripped);
  }

  const [integerPart, fractionalPart = ""] = stripped.split(separator);
  if (fractionalPart.length === 3 && integerPart.replace(/^-/, "").length >= 1) {
    return Number.parseFloat(`${integerPart}${fractionalPart}`);
  }

  return Number.parseFloat(`${integerPart}.${fractionalPart}`);
}

function parseNumericToken(value: string) {
  const parsed = normalizeNumericToken(value);
  return Number.isFinite(parsed) ? parsed : null;
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

function parseAtLineItem(line: string): InvoiceLineItemInput | null {
  const quantityFirstMatch = line.match(
    /^(?<quantity>\d+(?:[.,]\d+)?)\s*x\s+(?<description>.+?)\s*@\s*(?<unitPrice>[\d.,€$£-]+)$/i,
  );

  if (quantityFirstMatch?.groups) {
    const parsedQuantity = parseNumericToken(quantityFirstMatch.groups.quantity);
    const parsedUnitPrice = parseNumericToken(quantityFirstMatch.groups.unitPrice);
    if (!parsedQuantity || parsedQuantity <= 0 || parsedUnitPrice === null || parsedUnitPrice < 0) {
      return null;
    }

    return {
      description: quantityFirstMatch.groups.description.trim(),
      quantity: parsedQuantity,
      unitPrice: parsedUnitPrice,
    };
  }

  const singleQuantityMatch = line.match(/^(?<description>.+?)\s*@\s*(?<unitPrice>[\d.,€$£-]+)$/i);
  if (!singleQuantityMatch?.groups) {
    return null;
  }

  const parsedUnitPrice = parseNumericToken(singleQuantityMatch.groups.unitPrice);
  if (parsedUnitPrice === null || parsedUnitPrice < 0) {
    return null;
  }

  return {
    description: singleQuantityMatch.groups.description.trim(),
    quantity: 1,
    unitPrice: parsedUnitPrice,
  };
}

function parseTextLineItem(line: string): InvoiceLineItemInput | null {
  return parsePipeLineItem(line) ?? parseAtLineItem(line);
}

export function resolveLineItems(input: {
  lineItems?: Array<InvoiceLineItemInput>;
  lineItemsText?: string;
}) {
  if (input.lineItems?.length) {
    return input.lineItems;
  }

  if (!input.lineItemsText?.trim()) {
    throw new Error(structuredLineItemSchemaError);
  }

  const lines = input.lineItemsText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    throw new Error(structuredLineItemSchemaError);
  }

  const parsed = lines.map((line) => parseTextLineItem(line));
  if (parsed.some((item) => item === null)) {
    throw new Error(structuredLineItemSchemaError);
  }

  return parsed.filter((item): item is InvoiceLineItemInput => item !== null);
}

export function getDefaultInvoiceDates(now = new Date()) {
  const issuedAt = now.toISOString().slice(0, 10);
  const dueAtDate = new Date(now);
  dueAtDate.setDate(dueAtDate.getDate() + 30);

  return {
    dueAt: dueAtDate.toISOString().slice(0, 10),
    issuedAt,
  };
}
