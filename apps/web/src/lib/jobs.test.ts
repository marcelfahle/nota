import { expect, mock, test } from "bun:test";

import type { XRechnungValidationError } from "@/lib/xrechnung";

// The renderers are covered by their own tests; here only the files that end
// up on the email matter.
mock.module("@/lib/invoice-pdf-service", () => ({
  InvoicePdfDataError: class extends Error {},
  renderInvoicePdfForOrg: async () => ({
    buffer: new Uint8Array(Buffer.from("%PDF-1.7 test")),
    clientName: "Max Kunde",
    filename: "inv-0007-kunde-2026-09.pdf",
    invoiceNumber: "INV-0007",
  }),
}));

let xrechnungFailure: XRechnungValidationError | null = null;
mock.module("@/lib/xrechnung-service", () => ({
  InvoiceDocumentError: class extends Error {},
  renderXRechnungForOrg: async () => {
    if (xrechnungFailure) {
      throw xrechnungFailure;
    }
    return { filename: "inv-0007-kunde-2026-09.xml", xml: '<?xml version="1.0"?><Invoice/>' };
  },
}));

const { renderInvoiceAttachments } = await import("./jobs");
const org = { id: "org_1" } as Parameters<typeof renderInvoiceAttachments>[0];

test("a German send carries the PDF and the XML under the same base name", async () => {
  const files = await renderInvoiceAttachments(org, "inv_1", ["pdf", "xml"]);
  expect(files.map(({ contentType, filename }) => ({ contentType, filename }))).toEqual([
    { contentType: "application/pdf", filename: "inv-0007-kunde-2026-09.pdf" },
    { contentType: "application/xml", filename: "inv-0007-kunde-2026-09.xml" },
  ]);
  expect(files[1].content.toString("utf8")).toContain("<Invoice/>");
});

test("a PDF-only send never renders the XML", async () => {
  const { XRechnungValidationError } = await import("@/lib/xrechnung");
  xrechnungFailure = new XRechnungValidationError(["Add a contact phone number."]);
  const files = await renderInvoiceAttachments(org, "inv_1", ["pdf"]);
  expect(files.map(({ filename }) => filename)).toEqual(["inv-0007-kunde-2026-09.pdf"]);
  xrechnungFailure = null;
});

test("an incomplete XML fails the job instead of sending the PDF alone", async () => {
  const { XRechnungValidationError } = await import("@/lib/xrechnung");
  xrechnungFailure = new XRechnungValidationError(["Add a contact phone number."]);
  await expect(renderInvoiceAttachments(org, "inv_1", ["pdf", "xml"])).rejects.toThrow(
    "Add a contact phone number.",
  );
  xrechnungFailure = null;
});
