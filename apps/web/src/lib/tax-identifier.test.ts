import { describe, expect, test } from "bun:test";

import {
  formatTaxIdentifier,
  normalizeTaxIdentifier,
  taxIdentifierFromColumns,
  taxIdentifierFromLegacyVatNumber,
  taxIdentifierFields,
} from "@/lib/tax-identifier";

describe("tax identifiers", () => {
  test("formats and labels a synthetic US EIN without treating it as VAT", () => {
    const identifier = normalizeTaxIdentifier({ type: "us_ein", value: "12 3456789" });

    expect(identifier).toEqual({
      canonicalValue: "123456789",
      countryCode: "US",
      type: "us_ein",
      value: "12-3456789",
    });
    expect(formatTaxIdentifier(identifier)).toBe("EIN: 12-3456789");
    expect(taxIdentifierFields(identifier).vatNumber).toBeNull();
  });

  test("preserves EU VAT compatibility and canonical behavior", () => {
    const identifier = normalizeTaxIdentifier({ type: "eu_vat", value: "de 123.456.789" });

    expect(identifier).toEqual({
      canonicalValue: "DE123456789",
      countryCode: "DE",
      type: "eu_vat",
      value: "DE123456789",
    });
    expect(taxIdentifierFields(identifier).vatNumber).toBe("DE123456789");
  });

  test("classifies an ambiguous legacy value conservatively as a generic tax ID", () => {
    expect(taxIdentifierFromLegacyVatNumber("12-3456789")).toEqual({
      canonicalValue: "123456789",
      countryCode: null,
      type: "tax_id",
      value: "12-3456789",
    });
  });

  test("prefers explicit type data over a misleading legacy VAT field", () => {
    expect(
      taxIdentifierFromColumns({
        taxIdentifierType: "us_ein",
        taxIdentifierValue: "12-3456789",
        vatNumber: "123456789",
      }),
    ).toMatchObject({ type: "us_ein", value: "12-3456789" });
  });

  test("rejects invalid type-specific values", () => {
    expect(() => normalizeTaxIdentifier({ type: "us_ein", value: "123" })).toThrow(
      "nine-digit EIN",
    );
    expect(() => normalizeTaxIdentifier({ type: "eu_vat", value: "US123456789" })).toThrow(
      "EU VAT ID",
    );
  });
});
