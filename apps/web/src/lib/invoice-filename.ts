import { getDescriptionServiceMonth, getServiceMonthFilenameLabel } from "@/lib/service-period";

type InvoiceFilenameInput = {
  clientName: string;
  issuedAt: string;
  lineItems?: Array<{ description: string }>;
  number: string;
};

function slug(value: string) {
  return value
    .normalize("NFKD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .replaceAll("ß", "ss")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
}

// The invoice number is the unique bookkeeping reference. Keep the rest brief.
export function buildInvoiceFilename(input: InvoiceFilenameInput, extension: "pdf" | "xml") {
  const number = slug(input.number).slice(0, 80) || "invoice";
  const customer = slug(input.clientName).split("-")[0]?.slice(0, 40) || "client";
  const months = new Set(
    (input.lineItems ?? [])
      .map((item) => getDescriptionServiceMonth(item.description))
      .filter((month) => month !== null),
  );
  const period =
    months.size === 1
      ? getServiceMonthFilenameLabel([...months][0])
      : /^\d{4}-\d{2}-\d{2}$/.test(input.issuedAt)
        ? input.issuedAt
        : "undated";
  return `${number}-${customer}-${period}.${extension}`;
}
