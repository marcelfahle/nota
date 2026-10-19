import { expect, test } from "bun:test";

import { invoiceActivityText } from "@/lib/invoice-activity";

test("the send entry says what went out", () => {
  expect(
    invoiceActivityText({ action: "sent", metadata: { attachments: ["pdf", "xml"] } }, "EUR"),
  ).toBe("Sent with PDF and XRechnung XML");
  expect(invoiceActivityText({ action: "sent", metadata: { attachments: ["pdf"] } }, "EUR")).toBe(
    "Sent with PDF",
  );
});

test("older and manual send entries keep their plain label", () => {
  expect(invoiceActivityText({ action: "sent", metadata: null }, "EUR")).toBe("Invoice sent");
  expect(invoiceActivityText({ action: "sent", metadata: { manual: true } }, "EUR")).toBe(
    "Invoice sent",
  );
  expect(invoiceActivityText({ action: "reminder_sent", metadata: null }, "EUR")).toBe(
    "Payment reminder sent",
  );
});
