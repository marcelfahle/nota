import { expect, test } from "bun:test";

import {
  formatInvoiceDueDate,
  getInvoiceListStatus,
  matchesInvoiceSearch,
} from "@/lib/invoice-list";

test("derives the richer invoice list statuses from payments and views", () => {
  expect(
    getInvoiceListStatus({ balance: "300", openCount: 4, paidAmount: "200", status: "sent" }),
  ).toBe("part_paid");
  expect(
    getInvoiceListStatus({ balance: "500", openCount: 4, paidAmount: "0", status: "sent" }),
  ).toBe("opened");
  expect(
    getInvoiceListStatus({ balance: "500", openCount: 0, paidAmount: "0", status: "sent" }),
  ).toBe("sent");
});

test("formats overdue dates relative to the current UTC day", () => {
  const today = new Date("2026-10-04T23:30:00Z");
  expect(formatInvoiceDueDate("2026-09-25", "overdue", today)).toBe("9 days ago");
  expect(formatInvoiceDueDate("2026-10-03", "overdue", today)).toBe("1 day ago");
  expect(formatInvoiceDueDate("2026-10-30", "sent", today)).toBe("Oct 30");
});

test("searches client, number, raw amount, and formatted amount", () => {
  const invoice = {
    clientName: "Oxide GmbH",
    currency: "EUR",
    number: "INV-0042",
    total: "4800.00",
  };
  expect(matchesInvoiceSearch(invoice, "oxide")).toBe(true);
  expect(matchesInvoiceSearch(invoice, "0042")).toBe(true);
  expect(matchesInvoiceSearch(invoice, "4800")).toBe(true);
  expect(matchesInvoiceSearch(invoice, "€4,800.00")).toBe(true);
  expect(matchesInvoiceSearch(invoice, "lumen")).toBe(false);
});
