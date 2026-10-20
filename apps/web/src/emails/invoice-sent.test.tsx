import { expect, test } from "bun:test";

import { render } from "@react-email/components";

import { InvoiceSentEmail } from "@/emails/invoice-sent";

const props = {
  businessName: "Studio Beispiel",
  clientName: "Max Kunde",
  currency: "EUR",
  dueAt: "2026-11-15",
  invoiceNumber: "INV-0007",
  invoiceUrl: "http://localhost:3000/i/token",
  paymentLinkUrl: null,
  total: "119.00",
};

test("the invoice email mentions the XML only when it is attached", async () => {
  const sentence = "attached as a PDF and as XRechnung XML";
  expect(await render(InvoiceSentEmail({ ...props, xmlAttached: true }))).toContain(sentence);
  expect(await render(InvoiceSentEmail(props))).not.toContain(sentence);
  expect(await render(InvoiceSentEmail({ ...props, reminder: true }))).not.toContain(sentence);
});
