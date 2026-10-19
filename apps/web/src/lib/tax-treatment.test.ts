import { describe, expect, test } from "bun:test";

import {
  legacyReverseCharge,
  taxCategory,
  taxTreatmentFromLegacy,
  taxTreatmentNote,
} from "@/lib/tax-treatment";

describe("taxTreatmentFromLegacy", () => {
  test("keeps reverse charge and reads 0% as zero-rated, never as an exemption", () => {
    expect(taxTreatmentFromLegacy("true", "0")).toBe("reverse_charge");
    expect(taxTreatmentFromLegacy(true, "19")).toBe("reverse_charge");
    expect(taxTreatmentFromLegacy("false", "0")).toBe("zero_rated");
    expect(taxTreatmentFromLegacy(null, null)).toBe("zero_rated");
    expect(taxTreatmentFromLegacy("false", "19")).toBe("standard");
  });

  test("round-trips through the legacy flag", () => {
    expect(legacyReverseCharge("reverse_charge")).toBe("true");
    expect(legacyReverseCharge("exempt_small_business")).toBe("false");
  });
});

describe("taxCategory", () => {
  test("maps each treatment to its UNTDID 5305 category", () => {
    expect(taxCategory("standard", "19").code).toBe("S");
    expect(taxCategory("standard", "19").rate).toBe("19");
    expect(taxCategory("zero_rated", "0")).toMatchObject({ code: "Z", exemptionReason: null });
    expect(taxCategory("exempt_small_business", "0")).toMatchObject({
      code: "E",
      exemptionReason: "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.",
      exemptionReasonCode: null,
    });
    expect(taxCategory("reverse_charge", "0")).toMatchObject({
      code: "AE",
      exemptionReasonCode: "VATEX-EU-AE",
    });
  });

  test("prints a legal note for everything except standard VAT", () => {
    expect(taxTreatmentNote("standard")).toBeNull();
    expect(taxTreatmentNote("exempt_small_business")).toContain("§ 19 UStG");
    expect(taxTreatmentNote("reverse_charge")).toContain("Steuerschuldnerschaft");
  });
});
