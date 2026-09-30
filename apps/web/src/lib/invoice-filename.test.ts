import { describe, expect, test } from "bun:test";

import { buildInvoiceFilename } from "@/lib/invoice-filename";

describe("invoice download names", () => {
  const invoice = {
    clientName: "Ranger Marketing & Vertriebs GmbH",
    issuedAt: "2026-10-01",
    lineItems: [{ description: "Video Streaming & Server Betreuung - September 2026" }],
    number: "0000099",
  };
  test("matches the bookkeeping convention for PDF and XML", () => {
    expect(buildInvoiceFilename(invoice, "pdf")).toBe("0000099-ranger-september.pdf");
    expect(buildInvoiceFilename(invoice, "xml")).toBe("0000099-ranger-september.xml");
  });
  test("uses the service month, not the invoice month", () => {
    expect(
      buildInvoiceFilename(
        { ...invoice, lineItems: [{ description: "Betreuung – August 2026" }] },
        "pdf",
      ),
    ).toBe("0000099-ranger-august.pdf");
  });
  test("uses the issue date for mixed periods or non-period work", () => {
    expect(
      buildInvoiceFilename({ ...invoice, lineItems: [{ description: "Consulting" }] }, "pdf"),
    ).toBe("0000099-ranger-2026-10-01.pdf");
    expect(
      buildInvoiceFilename(
        {
          ...invoice,
          lineItems: [
            { description: "Services - July 2026" },
            { description: "Services - August 2026" },
          ],
        },
        "pdf",
      ),
    ).toBe("0000099-ranger-2026-10-01.pdf");
  });
  test("normalizes accents and removes unsafe characters without losing padding", () => {
    expect(
      buildInvoiceFilename(
        { clientName: "Müller GmbH", issuedAt: "2026-04-30", number: "INV/0042" },
        "xml",
      ),
    ).toBe("inv-0042-muller-2026-04-30.xml");
  });
});
