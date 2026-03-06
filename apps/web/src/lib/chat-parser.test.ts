import { describe, expect, test } from "bun:test";

import { getDefaultInvoiceDates, resolveChatInvoiceLineItems } from "@/lib/chat-parser";

describe("resolveChatInvoiceLineItems", () => {
  test("parses description-first hour notation", () => {
    expect(resolveChatInvoiceLineItems({ lineItemsText: "Development, 40hrs at €120" })).toEqual([
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
    expect(resolveChatInvoiceLineItems({ lineItemsText: "Advisory @ 1.200,50" })).toEqual([
      {
        description: "Advisory",
        quantity: 1,
        unitPrice: 1200.5,
      },
    ]);
  });

  test("handles repeated thousands separators", () => {
    expect(resolveChatInvoiceLineItems({ lineItemsText: "Platform work @ 1,234,567" })).toEqual([
      {
        description: "Platform work",
        quantity: 1,
        unitPrice: 1_234_567,
      },
    ]);
    expect(resolveChatInvoiceLineItems({ lineItemsText: "Architecture @ 1.234.567" })).toEqual([
      {
        description: "Architecture",
        quantity: 1,
        unitPrice: 1_234_567,
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
