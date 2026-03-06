import { describe, expect, test } from "bun:test";

import { resolveLineItems } from "../src/invoice-input.js";

describe("resolveLineItems", () => {
  test("parses pipe-separated rows", () => {
    expect(resolveLineItems({ lineItemsText: "Strategy workshop | 2 | 1500" })).toEqual([
      {
        description: "Strategy workshop",
        quantity: 2,
        unitPrice: 1500,
      },
    ]);
  });

  test("parses quantity-first shorthand", () => {
    expect(resolveLineItems({ lineItemsText: "2 x Discovery sprint @ 800" })).toEqual([
      {
        description: "Discovery sprint",
        quantity: 2,
        unitPrice: 800,
      },
    ]);
  });

  test("handles common thousands and decimal separators", () => {
    expect(resolveLineItems({ lineItemsText: "US style @ 1,200.50" })[0]?.unitPrice).toBe(1200.5);
    expect(resolveLineItems({ lineItemsText: "EU style @ 1.200,50" })[0]?.unitPrice).toBe(1200.5);
    expect(resolveLineItems({ lineItemsText: "Integer style @ 1,200" })[0]?.unitPrice).toBe(1200);
  });
});
