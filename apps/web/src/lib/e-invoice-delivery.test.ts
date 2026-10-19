import { describe, expect, test } from "bun:test";

import {
  defaultEInvoiceDelivery,
  invoiceAttachmentsFor,
  parseInvoiceAttachments,
} from "@/lib/e-invoice-delivery";

describe("defaultEInvoiceDelivery", () => {
  test("German workspaces attach the XRechnung by default", () => {
    expect(defaultEInvoiceDelivery("DE")).toBe("pdf_and_xrechnung");
    expect(defaultEInvoiceDelivery(" de ")).toBe("pdf_and_xrechnung");
  });

  test("everyone else starts with the PDF only", () => {
    expect(defaultEInvoiceDelivery("AT")).toBe("pdf_only");
    expect(defaultEInvoiceDelivery("ES")).toBe("pdf_only");
    expect(defaultEInvoiceDelivery(null)).toBe("pdf_only");
    expect(defaultEInvoiceDelivery(undefined)).toBe("pdf_only");
  });
});

describe("invoice attachments", () => {
  test("the setting decides what the send queues", () => {
    expect(invoiceAttachmentsFor("pdf_and_xrechnung")).toEqual(["pdf", "xml"]);
    expect(invoiceAttachmentsFor("pdf_only")).toEqual(["pdf"]);
  });

  test("old payloads and unknown values fall back to the PDF", () => {
    expect(parseInvoiceAttachments(undefined)).toEqual(["pdf"]);
    expect(parseInvoiceAttachments(["pdf", "xml"])).toEqual(["pdf", "xml"]);
    expect(parseInvoiceAttachments(["xml", "docx"])).toEqual(["pdf", "xml"]);
  });
});
