import { describe, expect, test } from "bun:test";

import {
  addDecimals,
  currencyExponent,
  formatCurrencyDecimal,
  formatStoredMoney,
  formatVariableDecimal,
  multiplyAndRound,
  percentageAndRound,
} from "@/lib/money";

describe("exact decimal money", () => {
  test("does not inherit binary floating-point errors", () => {
    expect(multiplyAndRound("0.1", "0.2", 2)).toBe("0.02");
    expect(percentageAndRound("0.05", "19.6", 2)).toBe("0.01");
  });

  test("rounds half up for positive and negative values", () => {
    expect(formatCurrencyDecimal("1.005", "EUR")).toBe("1.01");
    expect(formatCurrencyDecimal("-1.005", "EUR")).toBe("-1.01");
  });

  test("supports ISO zero, two, three, and four-decimal exponents", () => {
    expect(currencyExponent("JPY")).toBe(0);
    expect(formatCurrencyDecimal("10.5", "JPY")).toBe("11");
    expect(currencyExponent("EUR")).toBe(2);
    expect(formatCurrencyDecimal("10.555", "EUR")).toBe("10.56");
    expect(currencyExponent("BHD")).toBe(3);
    expect(formatCurrencyDecimal("10.5555", "BHD")).toBe("10.556");
    expect(currencyExponent("CLF")).toBe(4);
    expect(formatCurrencyDecimal("10.55555", "CLF")).toBe("10.5556");
  });

  test("rejects unknown currencies and payment over-precision", () => {
    expect(() => currencyExponent("NOT")).toThrow("Unsupported currency");
    expect(() => formatCurrencyDecimal("1.001", "EUR", "reject")).toThrow(
      "more than 2 decimal places",
    );
  });

  test("preserves nonconforming legacy stored money without weakening new writes", () => {
    expect(formatStoredMoney("150.5000", "JPY")).toBe("150.50");
    expect(formatStoredMoney("150.5000", "ZZZ")).toBe("150.50");
    expect(formatStoredMoney("10.2300", "EUR")).toBe("10.23");
    expect(formatStoredMoney("10.2300", "BHD")).toBe("10.230");
  });

  test("keeps fractional quantities to six decimal places", () => {
    expect(formatVariableDecimal("0.333333", 6, 2)).toBe("0.333333");
    expect(multiplyAndRound("0.333333", "0.10", 2)).toBe("0.03");
  });

  test("adds already-rounded line amounts exactly", () => {
    expect(addDecimals(["0.01", "0.01", "0.01"], 2)).toBe("0.03");
  });
});
