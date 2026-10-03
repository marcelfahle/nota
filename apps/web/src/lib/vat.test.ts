import { expect, test } from "bun:test";

import { normalizeVatNumber } from "@/lib/vat";

test("normalizes a formatted EU VAT number", () => {
  expect(normalizeVatNumber(" de 123.456-789 ")).toBe("DE123456789");
});
