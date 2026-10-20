export const E_INVOICE_DELIVERIES = ["pdf_only", "pdf_and_xrechnung"] as const;

export type EInvoiceDelivery = (typeof E_INVOICE_DELIVERIES)[number];

export type InvoiceAttachment = "pdf" | "xml";

/** German workspaces send the XML from day one; everyone else can turn it on. */
export function defaultEInvoiceDelivery(countryCode: string | null | undefined): EInvoiceDelivery {
  return countryCode?.trim().toUpperCase() === "DE" ? "pdf_and_xrechnung" : "pdf_only";
}

/** What the invoice email carries for a delivery setting. The PDF always goes. */
export function invoiceAttachmentsFor(delivery: EInvoiceDelivery): Array<InvoiceAttachment> {
  return delivery === "pdf_and_xrechnung" ? ["pdf", "xml"] : ["pdf"];
}

export function attachesXRechnung(delivery: EInvoiceDelivery) {
  return delivery === "pdf_and_xrechnung";
}

/** Reads the attachment list back from a job payload or activity entry. */
export function parseInvoiceAttachments(value: unknown): Array<InvoiceAttachment> {
  if (!Array.isArray(value)) {
    return ["pdf"];
  }
  const known = value.filter((item): item is InvoiceAttachment => item === "pdf" || item === "xml");
  return known.includes("pdf") ? known : ["pdf", ...known];
}
