import { expect, test } from "bun:test";

import { apiInvoicePayloadSchema } from "@/lib/api-invoices";

test("REST invoice input preserves decimal strings through validation", () => {
  const result = apiInvoicePayloadSchema.parse({
    clientId: "00000000-0000-4000-8000-000000000001",
    currency: "BHD",
    dueAt: "2026-11-01",
    issuedAt: "2026-10-05",
    lineItems: [{ description: "Fractional service", quantity: "1.25", unitPrice: "0.3336" }],
    taxRate: "5.125",
  });

  expect(result.lineItems[0]).toMatchObject({ quantity: "1.25", unitPrice: "0.3336" });
  expect(result.taxRate).toBe("5.125");
});
