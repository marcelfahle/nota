import { describe, expect, test } from "bun:test";

import {
  calculateInvoiceTotals,
  reconcileInvoiceAmounts,
  reconcileStoredInvoiceAmounts,
} from "@/lib/invoice-service";

describe("invoice money policy", () => {
  test("rounds each line before subtotal and rounds tax once", () => {
    expect(
      calculateInvoiceTotals(
        [
          { quantity: "1", unitPrice: "0.005" },
          { quantity: "1", unitPrice: "0.005" },
          { quantity: "1", unitPrice: "0.005" },
        ],
        "19.6",
        "EUR",
      ),
    ).toEqual({
      lineAmounts: ["0.01", "0.01", "0.01"],
      subtotal: "0.03",
      taxAmount: "0.01",
      taxRate: "19.60",
      total: "0.04",
    });
  });

  test("calculates fractional quantities in three-decimal currencies", () => {
    expect(calculateInvoiceTotals([{ quantity: "1.25", unitPrice: "0.3336" }], 5, "BHD")).toEqual({
      lineAmounts: ["0.417"],
      subtotal: "0.417",
      taxAmount: "0.021",
      taxRate: "5.00",
      total: "0.438",
    });
  });

  test("calculates zero-decimal invoices with the same half-up policy", () => {
    expect(calculateInvoiceTotals([{ quantity: "1.5", unitPrice: "100.5" }], "10", "JPY")).toEqual({
      lineAmounts: ["151"],
      subtotal: "151",
      taxAmount: "15",
      taxRate: "10.00",
      total: "166",
    });
  });

  test("reconciles partial payments and credits without residual cents", () => {
    expect(reconcileInvoiceAmounts("10.00", ["3.33", "3.33"], "-3.34", "EUR")).toEqual({
      balance: "0.00",
      creditedAmount: "3.34",
      paidAmount: "6.66",
    });
  });

  test("reconciles legacy values at stored precision", () => {
    expect(reconcileStoredInvoiceAmounts("150.5000", ["50.2500"], "-25.1250", "JPY")).toEqual({
      balance: "75.125",
      creditedAmount: "25.125",
      paidAmount: "50.25",
    });
    expect(reconcileStoredInvoiceAmounts("150.5000", ["50.2500"], "-25.1250", "ZZZ")).toEqual({
      balance: "75.125",
      creditedAmount: "25.125",
      paidAmount: "50.25",
    });
  });

  test("rejects inputs that exceed persisted precision", () => {
    expect(() =>
      calculateInvoiceTotals([{ quantity: "0.3333333", unitPrice: "1" }], 0, "EUR"),
    ).toThrow("more than 6 decimal places");
  });
});
