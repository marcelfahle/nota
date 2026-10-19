import { describe, expect, test } from "bun:test";

import {
  type ComplianceInput,
  taxTreatmentConflict,
  validateForIssuance,
  validateForSending,
  validateForXRechnung,
} from "@/lib/invoice-compliance";

function germanB2B(): ComplianceInput {
  return {
    client: {
      city: "München",
      company: "Kunde GmbH",
      countryCode: "DE",
      name: "Max Kunde",
      postalCode: "80331",
      publicSector: false,
      street: "Kundenweg 2",
      taxIdentifier: {
        canonicalValue: "DE987654321",
        countryCode: "DE",
        type: "eu_vat",
        value: "DE987654321",
      },
    },
    invoice: {
      buyerReference: null,
      kind: "invoice",
      lineItemCount: 1,
      servicePeriodEnd: "2026-09-30",
      servicePeriodStart: "2026-09-01",
      taxRate: "19",
      taxTreatment: "standard",
    },
    org: {
      businessName: "Studio Beispiel",
      city: "Berlin",
      contactEmail: "anna@beispiel.de",
      contactName: "Anna Beispiel",
      contactPhone: "+49 30 1234567",
      countryCode: "DE",
      legalName: "Anna Beispiel",
      name: "Beispiel",
      postalCode: "10115",
      street: "Musterstraße 1",
      taxIdentifier: {
        canonicalValue: "DE123456789",
        countryCode: "DE",
        type: "eu_vat",
        value: "DE123456789",
      },
    },
  };
}

describe("taxTreatmentConflict", () => {
  test("rejects a rate on anything but standard VAT", () => {
    expect(taxTreatmentConflict("reverse_charge", "19")).toContain("Reverse charge");
    expect(taxTreatmentConflict("exempt_small_business", 7)).toContain("§ 19 UStG");
    expect(taxTreatmentConflict("zero_rated", "0.5")).toContain("Zero-rated");
  });

  test("accepts matching combinations", () => {
    expect(taxTreatmentConflict("standard", "19")).toBeNull();
    expect(taxTreatmentConflict("standard", "0")).toBeNull();
    expect(taxTreatmentConflict("reverse_charge", "0")).toBeNull();
    expect(taxTreatmentConflict("exempt_small_business", null)).toBeNull();
  });
});

describe("validateForIssuance", () => {
  test("a complete German B2B invoice has no problems", () => {
    expect(validateForIssuance(germanB2B())).toEqual([]);
  });

  test("standard VAT at 0% must be made explicit", () => {
    const input = germanB2B();
    input.invoice.taxRate = "0";
    expect(validateForIssuance(input)).toEqual([
      expect.stringContaining("The tax rate is 0% but the treatment is standard VAT"),
    ]);
  });

  test("German orgs need seller identity, buyer address and a service period", () => {
    const input = germanB2B();
    input.org.street = null;
    input.org.taxIdentifier = null;
    input.org.contactName = "";
    input.client.street = null;
    input.client.address = "Kundenweg 2, 80331 München";
    input.invoice.servicePeriodStart = null;
    input.invoice.servicePeriodEnd = null;
    const problems = validateForIssuance(input);
    expect(problems).toContain("Add your street, postal code and city in Settings.");
    expect(problems).toContain("Add your tax number (Steuernummer) or VAT ID in Settings.");
    expect(problems).toContain("Add a contact name and email for your business in Settings.");
    expect(problems).toContain(
      "Split the client's address into street, postal code, city and country.",
    );
    expect(problems).toContain("Add the service date or period.");
  });

  test("a German Steuernummer counts as the seller tax identifier", () => {
    const input = germanB2B();
    input.org.taxIdentifier = {
      canonicalValue: "2112345678",
      countryCode: "DE",
      type: "tax_id",
      value: "21/123/45678",
    };
    expect(validateForIssuance(input)).toEqual([]);
  });

  test("Kleinunternehmer needs no VAT ID and no client VAT ID", () => {
    const input = germanB2B();
    input.invoice.taxTreatment = "exempt_small_business";
    input.invoice.taxRate = "0";
    input.org.taxIdentifier = {
      canonicalValue: "2112345678",
      countryCode: "DE",
      type: "tax_id",
      value: "21/123/45678",
    };
    input.client.taxIdentifier = null;
    expect(validateForIssuance(input)).toEqual([]);
  });

  test("reverse charge needs a foreign business customer with a VAT ID in the EU", () => {
    const input = germanB2B();
    input.invoice.taxTreatment = "reverse_charge";
    input.invoice.taxRate = "0";
    expect(validateForIssuance(input)).toEqual([
      "Reverse charge applies to business customers in another country. Use standard VAT for domestic clients.",
    ]);

    input.client.countryCode = "FR";
    input.client.taxIdentifier = null;
    expect(validateForIssuance(input)).toEqual([
      "Reverse charge in the EU needs the client's VAT ID.",
    ]);

    input.client.taxIdentifier = {
      canonicalValue: "FR12345678901",
      countryCode: "FR",
      type: "eu_vat",
      value: "FR12345678901",
    };
    expect(validateForIssuance(input)).toEqual([]);

    // Outside the EU the recipient's own rules apply; no VAT ID is demanded.
    input.client.countryCode = "CH";
    input.client.taxIdentifier = null;
    expect(validateForIssuance(input)).toEqual([]);
  });

  test("reverse charge with a tax rate is a contradiction", () => {
    const input = germanB2B();
    input.invoice.taxTreatment = "reverse_charge";
    input.client.countryCode = "FR";
    input.client.taxIdentifier = {
      canonicalValue: "FR12345678901",
      countryCode: "FR",
      type: "eu_vat",
      value: "FR12345678901",
    };
    expect(validateForIssuance(input)).toEqual([
      "Reverse charge invoices carry no VAT. Set the tax rate to 0 or choose standard VAT.",
    ]);
  });

  test("public-sector clients need a buyer reference", () => {
    const input = germanB2B();
    input.client.publicSector = true;
    expect(validateForIssuance(input)).toEqual([
      "Public-sector clients need a buyer reference (Leitweg-ID).",
    ]);
    input.invoice.buyerReference = "04011000-1234512345-35";
    expect(validateForIssuance(input)).toEqual([]);
  });

  test("the service period must be complete and ordered", () => {
    const input = germanB2B();
    input.invoice.servicePeriodEnd = "2026-08-31";
    expect(validateForIssuance(input)).toEqual([
      "The service period must end on or after it starts.",
    ]);
    input.invoice.servicePeriodEnd = null;
    expect(validateForIssuance(input)).toEqual([
      "Give both the start and the end of the service period, or a single date.",
    ]);
  });

  test("an Austrian seller may reverse-charge a German business", () => {
    const input = germanB2B();
    input.org.countryCode = "AT";
    input.invoice.taxTreatment = "reverse_charge";
    input.invoice.taxRate = "0";
    expect(validateForIssuance(input)).toEqual([]);
    expect(validateForXRechnung(input)).toEqual([]);
  });

  test("non-German orgs keep their legacy freedom apart from consistency", () => {
    const input = germanB2B();
    input.org.countryCode = "ES";
    input.org.street = null;
    input.org.taxIdentifier = null;
    input.client.street = null;
    input.invoice.servicePeriodStart = null;
    input.invoice.servicePeriodEnd = null;
    input.invoice.taxRate = "0";
    expect(validateForIssuance(input)).toEqual([]);

    input.invoice.taxTreatment = "exempt_small_business";
    input.invoice.taxRate = "21";
    expect(validateForIssuance(input)).toEqual([
      "Small business exemption (§ 19 UStG) invoices carry no VAT. Set the tax rate to 0 or choose standard VAT.",
    ]);
  });
});

describe("validateForXRechnung", () => {
  test("does not demand a period from an already issued legacy invoice", () => {
    const input = germanB2B();
    input.invoice.issued = true;
    input.invoice.servicePeriodStart = null;
    input.invoice.servicePeriodEnd = null;
    expect(validateForXRechnung(input)).toEqual([]);
  });

  test("adds the seller phone and party requirements for any org", () => {
    const input = germanB2B();
    input.org.contactPhone = null;
    expect(validateForXRechnung(input)).toEqual([
      "Add a contact phone number for your business in Settings.",
    ]);

    input.org.countryCode = "ES";
    input.org.street = null;
    input.invoice.servicePeriodStart = null;
    input.invoice.servicePeriodEnd = null;
    input.invoice.taxRate = "0";
    const problems = validateForXRechnung(input);
    expect(problems).toContain("Add your street, postal code and city in Settings.");
    expect(problems).toContain("Add the service date or period.");
    expect(problems).toContain(
      "The tax rate is 0% but the treatment is standard VAT. Pick zero-rated, small business exemption (§ 19 UStG) or reverse charge, or set a tax rate.",
    );
    expect(new Set(problems).size).toBe(problems.length);
  });
});

describe("validateForSending", () => {
  test("a workspace that attaches the XML is held to the export rules before anything is queued", () => {
    const input = germanB2B();
    input.org.contactPhone = null;
    expect(validateForSending(input, "pdf_only")).toEqual([]);
    expect(validateForSending(input, "pdf_and_xrechnung")).toEqual([
      "Add a contact phone number for your business in Settings.",
    ]);
  });

  test("lists every problem once, in plain English", () => {
    const input = germanB2B();
    input.org.contactPhone = null;
    input.client.countryCode = null;
    input.client.street = null;
    expect(validateForSending(input, "pdf_and_xrechnung")).toEqual([
      "Add the client's street, postal code, city and country.",
      "Add the client's country.",
      "Add a contact phone number for your business in Settings.",
    ]);
  });
});
