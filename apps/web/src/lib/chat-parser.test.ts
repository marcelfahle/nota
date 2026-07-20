import { describe, expect, test } from "bun:test";

import {
  getDefaultInvoiceDates,
  resolveChatInvoiceDates,
  resolveChatInvoiceLineItems,
} from "@/lib/chat-parser";

describe("resolveChatInvoiceLineItems", () => {
  test("parses description-first hour notation", () => {
    expect(
      resolveChatInvoiceLineItems({
        lineItemsText: "Development, 40hrs at €120",
      }),
    ).toEqual([
      {
        description: "Development",
        quantity: 40,
        unitPrice: 120,
      },
    ]);
  });

  test("parses mixed shorthand formats", () => {
    expect(
      resolveChatInvoiceLineItems({
        lineItemsText: "2 x Strategy workshop @ 1,200.50\nDiscovery | 1 | 800",
      }),
    ).toEqual([
      {
        description: "Strategy workshop",
        quantity: 2,
        unitPrice: 1200.5,
      },
      {
        description: "Discovery",
        quantity: 1,
        unitPrice: 800,
      },
    ]);
  });

  test("handles EU thousands and decimals", () => {
    expect(
      resolveChatInvoiceLineItems({ lineItemsText: "Advisory @ 1.200,50" }),
    ).toEqual([
      {
        description: "Advisory",
        quantity: 1,
        unitPrice: 1200.5,
      },
    ]);
  });

  test("handles repeated thousands separators", () => {
    expect(
      resolveChatInvoiceLineItems({
        lineItemsText: "Platform work @ 1,234,567",
      }),
    ).toEqual([
      {
        description: "Platform work",
        quantity: 1,
        unitPrice: 1_234_567,
      },
    ]);
    expect(
      resolveChatInvoiceLineItems({
        lineItemsText: "Architecture @ 1.234.567",
      }),
    ).toEqual([
      {
        description: "Architecture",
        quantity: 1,
        unitPrice: 1_234_567,
      },
    ]);
  });

  test("creates a default line item from a flat total amount", () => {
    expect(resolveChatInvoiceLineItems({ totalAmount: 1000 })).toEqual([
      {
        description: "Services",
        quantity: 1,
        unitPrice: 1000,
      },
    ]);
  });

  test("scales template line items to match a requested total", () => {
    expect(
      resolveChatInvoiceLineItems({
        templateLineItems: [
          {
            description: "Product strategy",
            quantity: 2,
            unitPrice: 250,
          },
          {
            description: "Implementation",
            quantity: 5,
            unitPrice: 100,
          },
        ],
        totalAmount: 2000,
      }),
    ).toEqual([
      {
        description: "Product strategy",
        quantity: 2,
        unitPrice: 500,
      },
      {
        description: "Implementation",
        quantity: 5,
        unitPrice: 200,
      },
    ]);
  });

  test("treats a flat total as the invoice total when tax is present", () => {
    expect(
      resolveChatInvoiceLineItems({ taxRate: 19, totalAmount: 119 }),
    ).toEqual([
      {
        description: "Services",
        quantity: 1,
        unitPrice: 100,
      },
    ]);
  });

  test("copies template line items when requested without a new amount", () => {
    expect(
      resolveChatInvoiceLineItems({
        templateLineItems: [
          {
            description: "Monthly retainer",
            quantity: 1,
            unitPrice: 1000,
          },
        ],
      }),
    ).toEqual([
      {
        description: "Monthly retainer",
        quantity: 1,
        unitPrice: 1000,
      },
    ]);
  });
});

describe("getDefaultInvoiceDates", () => {
  test("formats local YYYY-MM-DD dates", () => {
    const now = new Date(2026, 2, 6, 23, 45, 0);

    expect(getDefaultInvoiceDates(now)).toEqual({
      dueAt: "2026-04-05",
      issuedAt: "2026-03-06",
    });
  });
});

describe("resolveChatInvoiceDates", () => {
  test("uses the end of an inferred invoice month", () => {
    expect(
      resolveChatInvoiceDates({
        invoiceMonth: "May",
        now: new Date(2026, 5, 4, 12, 0, 0),
      }),
    ).toEqual({
      dueAt: "2026-06-30",
      issuedAt: "2026-05-31",
    });
  });

  test("rolls future month names back to the previous year", () => {
    expect(
      resolveChatInvoiceDates({
        invoiceMonth: "December",
        now: new Date(2026, 0, 10, 12, 0, 0),
      }),
    ).toEqual({
      dueAt: "2026-01-30",
      issuedAt: "2025-12-31",
    });
  });

  test("derives a due date from an explicit issue date", () => {
    expect(
      resolveChatInvoiceDates({
        issuedAt: "2026-05-31",
        now: new Date(2026, 5, 4, 12, 0, 0),
      }),
    ).toEqual({
      dueAt: "2026-06-30",
      issuedAt: "2026-05-31",
    });
  });

  test("keeps an explicit due date", () => {
    expect(
      resolveChatInvoiceDates({
        dueAt: "2026-07-15",
        invoiceMonth: "2026-05",
        now: new Date(2026, 5, 4, 12, 0, 0),
      }),
    ).toEqual({
      dueAt: "2026-07-15",
      issuedAt: "2026-05-31",
    });
  });
});
