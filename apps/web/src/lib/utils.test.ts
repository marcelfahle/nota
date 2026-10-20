import { describe, expect, test } from "bun:test";

import { formatCurrency, formatDate, formatNumber, orgLocale } from "@/lib/utils";

describe("orgLocale", () => {
  test("picks de-DE for Germany and Austria however the country is written", () => {
    expect(orgLocale({ country: "Germany" })).toBe("de-DE");
    expect(orgLocale({ country: "Deutschland" })).toBe("de-DE");
    expect(orgLocale({ country: "DE" })).toBe("de-DE");
    expect(orgLocale({ country: " austria " })).toBe("de-DE");
    expect(orgLocale({ country: "Österreich" })).toBe("de-DE");
  });

  test("falls back to en-US everywhere else", () => {
    expect(orgLocale({ country: "Spain" })).toBe("en-US");
    expect(orgLocale({ country: "United States" })).toBe("en-US");
    expect(orgLocale({ country: null })).toBe("en-US");
    expect(orgLocale(null)).toBe("en-US");
  });
});

describe("formatCurrency", () => {
  test("renders EUR per locale", () => {
    expect(formatCurrency(1234.56, "EUR", "de-DE")).toBe("1.234,56\u00A0€");
    expect(formatCurrency(1234.56, "EUR", "en-US")).toBe("€1,234.56");
  });

  test("defaults to en-US", () => {
    expect(formatCurrency(1234.56)).toBe("€1,234.56");
    expect(formatCurrency(1234.56, "USD", "de-DE")).toBe("1.234,56\u00A0$");
  });
});

describe("formatNumber", () => {
  test("renders plain numbers per locale with at most two decimals", () => {
    expect(formatNumber(1234.5, "de-DE")).toBe("1.234,5");
    expect(formatNumber(1234.5, "en-US")).toBe("1,234.5");
    expect(formatNumber(19.004, "de-DE")).toBe("19");
  });
});

describe("formatDate", () => {
  test("renders calendar dates per locale without shifting the day", () => {
    expect(formatDate("2026-10-19", "de-DE")).toBe("19. Okt. 2026");
    expect(formatDate("2026-10-19", "en-US")).toBe("Oct 19, 2026");
    expect(formatDate("2026-01-01", "en-US")).toBe("Jan 1, 2026");
  });

  test("accepts timestamps and custom options", () => {
    expect(formatDate("2026-10-19T23:30:00.000Z", "en-US")).toBe("Oct 19, 2026");
    expect(
      formatDate(new Date("2026-10-19T00:00:00Z"), "de-DE", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    ).toBe("19. Oktober 2026");
    expect(formatDate("2026-10-19", "en-US", { day: "numeric", month: "short" })).toBe("Oct 19");
    expect(formatDate("2026-10-19", "de-DE", { day: "numeric", month: "short" })).toBe("19. Okt.");
  });
});
