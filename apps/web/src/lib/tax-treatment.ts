export const TAX_TREATMENTS = [
  "standard",
  "zero_rated",
  "exempt_small_business",
  "reverse_charge",
] as const;

export type TaxTreatment = (typeof TAX_TREATMENTS)[number];

/** Short label for forms, lists and chat replies. */
export const TAX_TREATMENT_LABELS: Record<TaxTreatment, string> = {
  exempt_small_business: "Small business exemption (§ 19 UStG)",
  reverse_charge: "Reverse charge",
  standard: "Standard VAT",
  zero_rated: "Zero-rated (0%)",
};

/** One sentence under the tax treatment picker explaining when it applies. */
export const TAX_TREATMENT_HINTS: Record<TaxTreatment, string> = {
  exempt_small_business:
    "You are a Kleinunternehmer under § 19 UStG and do not charge VAT. The invoice carries the required note.",
  reverse_charge:
    "A business customer abroad owes the VAT (§ 13b UStG, Art. 196 VAT Directive). Needs the client's VAT ID and a 0% rate.",
  standard: "You charge VAT at the rate below, for example 19% or 7%.",
  zero_rated:
    "A genuine 0% supply, for example an intra-community delivery of goods. Not for exemptions.",
};

/** Legal note printed on the human-readable invoice. Null for standard VAT. */
export function taxTreatmentNote(treatment: TaxTreatment): string | null {
  switch (treatment) {
    case "exempt_small_business":
      return "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.";
    case "reverse_charge":
      return "Steuerschuldnerschaft des Leistungsempfängers (Reverse charge, § 13b UStG / Art. 196 VAT Directive).";
    case "zero_rated":
      return "Zero-rated supply: 0% VAT.";
    default:
      return null;
  }
}

/** UNTDID 5305 tax category and the EN 16931 exemption reason for a treatment. */
export function taxCategory(treatment: TaxTreatment, taxRate: string) {
  switch (treatment) {
    case "exempt_small_business":
      return {
        code: "E",
        exemptionReason: taxTreatmentNote("exempt_small_business"),
        exemptionReasonCode: null,
        rate: "0",
      };
    case "reverse_charge":
      return {
        code: "AE",
        exemptionReason: "Steuerschuldnerschaft des Leistungsempfängers",
        exemptionReasonCode: "VATEX-EU-AE",
        rate: "0",
      };
    case "zero_rated":
      return { code: "Z", exemptionReason: null, exemptionReasonCode: null, rate: "0" };
    default:
      return { code: "S", exemptionReason: null, exemptionReasonCode: null, rate: taxRate };
  }
}

/** Every treatment except standard VAT is only valid with a 0% rate. */
export function requiresZeroRate(treatment: TaxTreatment) {
  return treatment !== "standard";
}

/** The legacy flag, kept in sync so older API clients keep reading it. */
export function legacyReverseCharge(treatment: TaxTreatment) {
  return treatment === "reverse_charge" ? "true" : "false";
}
