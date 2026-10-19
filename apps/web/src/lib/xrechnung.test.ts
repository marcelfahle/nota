import { describe, expect, test } from "bun:test";

import {
  escapeXml,
  extractIban,
  generateXRechnung,
  parseAddress,
  toCountryCode,
  type XRechnungData,
  XRechnungValidationError,
} from "@/lib/xrechnung";

// ---------------------------------------------------------------------------
// Shared fixture: ordinary German B2B invoice at 19%
// ---------------------------------------------------------------------------
function germanB2B(): XRechnungData {
  return {
    business: {
      bankDetails: "IBAN: DE89370400440532013000\nBIC: COBADEFFXXX",
      city: "Berlin",
      contact: { email: "anna@beispiel.de", name: "Anna Beispiel", phone: "+49 30 1234567" },
      countryCode: "DE",
      email: "anna@beispiel.de",
      name: "Anna Beispiel",
      postalCode: "10115",
      street: "Musterstraße 1",
      taxIdentifier: {
        canonicalValue: "DE123456789",
        countryCode: "DE",
        type: "eu_vat",
        value: "DE123456789",
      },
    },
    client: {
      city: "München",
      company: "Kunde GmbH",
      countryCode: "DE",
      email: "buchhaltung@kunde.de",
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
      currency: "EUR",
      dueAt: "2026-10-31",
      issuedAt: "2026-10-01",
      lineItems: [
        {
          amount: "1000.00",
          description: "Beratung September 2026",
          quantity: "10",
          unitPrice: "100.00",
        },
      ],
      notes: "Vielen Dank",
      number: "INV-0001",
      paymentLinkUrl: null,
      servicePeriodEnd: "2026-09-30",
      servicePeriodStart: "2026-09-01",
      subtotal: "1000.00",
      taxAmount: "190.00",
      taxRate: "19",
      taxTreatment: "standard",
      total: "1190.00",
    },
  };
}

function kleinunternehmer(): XRechnungData {
  const data = germanB2B();
  data.business.taxIdentifier = {
    canonicalValue: "2112345678",
    countryCode: "DE",
    type: "tax_id",
    value: "21/123/45678",
  };
  data.client.taxIdentifier = null;
  Object.assign(data.invoice, {
    taxAmount: "0.00",
    taxRate: "0",
    taxTreatment: "exempt_small_business" as const,
    total: "1000.00",
  });
  return data;
}

function reverseChargeToFrance(): XRechnungData {
  const data = germanB2B();
  Object.assign(data.client, {
    city: "Paris",
    company: "Client SARL",
    countryCode: "FR",
    postalCode: "75001",
    street: "1 rue de Rivoli",
    taxIdentifier: {
      canonicalValue: "FR12345678901",
      countryCode: "FR",
      type: "eu_vat" as const,
      value: "FR12345678901",
    },
  });
  Object.assign(data.invoice, {
    taxAmount: "0.00",
    taxRate: "0",
    taxTreatment: "reverse_charge" as const,
    total: "1000.00",
  });
  return data;
}

function creditNote(): XRechnungData {
  const data = germanB2B();
  Object.assign(data.invoice, {
    kind: "credit_note" as const,
    number: "CN-0001",
    originalNumber: "INV-0001",
    subtotal: "-1000.00",
    taxAmount: "-190.00",
    total: "-1190.00",
  });
  data.invoice.lineItems[0].amount = "-1000.00";
  data.invoice.lineItems[0].unitPrice = "-100.00";
  return data;
}

function publicSectorBuyer(): XRechnungData {
  const data = germanB2B();
  Object.assign(data.client, {
    company: "Stadt Musterstadt",
    email: "rechnungen@musterstadt.de",
    name: "Rechnungsstelle",
    publicSector: true,
    taxIdentifier: null,
  });
  data.invoice.buyerReference = "04011000-1234512345-35";
  return data;
}

// ---------------------------------------------------------------------------
// escapeXml
// ---------------------------------------------------------------------------
describe("escapeXml", () => {
  test("escapes &, <, >, \", '", () => {
    expect(escapeXml("A & B < C > D \"E\" 'F'")).toBe(
      "A &amp; B &lt; C &gt; D &quot;E&quot; &apos;F&apos;",
    );
  });

  test("leaves plain text unchanged", () => {
    expect(escapeXml("Hello World")).toBe("Hello World");
  });
});

// ---------------------------------------------------------------------------
// toCountryCode / parseAddress (legacy free text only)
// ---------------------------------------------------------------------------
describe("toCountryCode", () => {
  test("returns ISO code for full country name", () => {
    expect(toCountryCode("Germany")).toBe("DE");
    expect(toCountryCode("spain")).toBe("ES");
    expect(toCountryCode("United Kingdom")).toBe("GB");
    expect(toCountryCode("Portugal")).toBe("PT");
  });

  test("passes through 2-letter codes", () => {
    expect(toCountryCode("DE")).toBe("DE");
    expect(toCountryCode("fr")).toBe("FR");
  });

  test("never guesses an unknown name", () => {
    expect(toCountryCode("Narnia")).toBeNull();
  });
});

describe("parseAddress", () => {
  const empty = { city: null, countryCode: null, postalCode: null, street: null };

  test("returns empty for null/undefined", () => {
    expect(parseAddress(null)).toEqual(empty);
    expect(parseAddress(undefined)).toEqual(empty);
  });

  test("parses 1-line address as street only", () => {
    expect(parseAddress("123 Main St")).toEqual({ ...empty, street: "123 Main St" });
  });

  test("parses 2-line address as street + city/postal", () => {
    expect(parseAddress("Main St 1\n10115 Berlin")).toEqual({
      city: "Berlin",
      countryCode: null,
      postalCode: "10115",
      street: "Main St 1",
    });
  });

  test("parses 3-part addresses with country, on lines or commas", () => {
    const expected = {
      city: "Berlin",
      countryCode: "DE",
      postalCode: "10115",
      street: "Main St 1",
    };
    expect(parseAddress("Main St 1\n10115 Berlin\nGermany")).toEqual(expected);
    expect(parseAddress("Main St 1, 10115 Berlin, Germany")).toEqual(expected);
  });
});

// ---------------------------------------------------------------------------
// extractIban
// ---------------------------------------------------------------------------
describe("extractIban", () => {
  test("extracts IBAN from freeform text", () => {
    expect(extractIban("IBAN: DE89370400440532013000\nBIC: COBADEFFXXX")).toBe(
      "DE89370400440532013000",
    );
  });

  test("extracts IBAN with single optional space", () => {
    expect(extractIban("DE89 370400440532013000")).toBe("DE89370400440532013000");
  });

  test("returns null for no IBAN", () => {
    expect(extractIban("Some random bank details")).toBeNull();
  });

  test("returns null for null/undefined", () => {
    expect(extractIban(null)).toBeNull();
    expect(extractIban(undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// generateXRechnung — fixtures for the supported German scenarios
// ---------------------------------------------------------------------------
describe("generateXRechnung fixtures", () => {
  test("ordinary German B2B at 19%: category S, period, seller contact and VAT IDs", () => {
    const xml = generateXRechnung(germanB2B());
    expect(xml).toContain(
      "<cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0</cbc:CustomizationID>",
    );
    expect(xml).toContain("<cbc:ID>S</cbc:ID>");
    expect(xml).toContain("<cbc:Percent>19.00</cbc:Percent>");
    expect(xml).toContain(
      "<cac:InvoicePeriod>\n<cbc:StartDate>2026-09-01</cbc:StartDate>\n<cbc:EndDate>2026-09-30</cbc:EndDate>\n</cac:InvoicePeriod>",
    );
    expect(xml).toContain("<cbc:BuyerReference>INV-0001</cbc:BuyerReference>");
    expect(xml).toContain(
      "<cbc:Name>Anna Beispiel</cbc:Name>\n<cbc:Telephone>+49 30 1234567</cbc:Telephone>\n<cbc:ElectronicMail>anna@beispiel.de</cbc:ElectronicMail>",
    );
    expect(xml).toContain(
      "<cbc:CompanyID>DE123456789</cbc:CompanyID>\n<cac:TaxScheme>\n<cbc:ID>VAT</cbc:ID>",
    );
    expect(xml).not.toContain("<cac:PartyIdentification>");
    expect(xml).toContain("<cbc:CompanyID>DE987654321</cbc:CompanyID>");
    expect(xml).toContain("<cbc:StreetName>Musterstraße 1</cbc:StreetName>");
    expect(xml).toContain("<cbc:PostalZone>80331</cbc:PostalZone>");
    expect(xml).toContain("<cbc:IdentificationCode>DE</cbc:IdentificationCode>");
    expect(xml).not.toContain("<cbc:TaxExemptionReason>");
    expect(xml).toContain('<cbc:PayableAmount currencyID="EUR">1190.00</cbc:PayableAmount>');
  });

  test("Kleinunternehmer: category E with the § 19 UStG reason and a Steuernummer (scheme FC)", () => {
    const xml = generateXRechnung(kleinunternehmer());
    expect(xml).toContain("<cbc:ID>E</cbc:ID>");
    expect(xml).toContain("<cbc:Percent>0.00</cbc:Percent>");
    expect(xml).toContain(
      "<cbc:TaxExemptionReason>Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.</cbc:TaxExemptionReason>",
    );
    expect(xml).not.toContain("<cbc:TaxExemptionReasonCode>");
    expect(xml).toContain(
      "<cbc:CompanyID>21/123/45678</cbc:CompanyID>\n<cac:TaxScheme>\n<cbc:ID>FC</cbc:ID>",
    );
    // BR-CO-26: the Steuernummer also serves as the seller identifier (BT-29).
    expect(xml).toContain(
      "<cac:PartyIdentification>\n<cbc:ID>21/123/45678</cbc:ID>\n</cac:PartyIdentification>",
    );
    expect(xml).toContain('<cbc:TaxAmount currencyID="EUR">0.00</cbc:TaxAmount>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="EUR">1000.00</cbc:PayableAmount>');
  });

  test("reverse charge to an EU business: category AE with VATEX-EU-AE and both VAT IDs", () => {
    const xml = generateXRechnung(reverseChargeToFrance());
    expect(xml).toContain("<cbc:ID>AE</cbc:ID>");
    expect(xml).toContain("<cbc:TaxExemptionReasonCode>VATEX-EU-AE</cbc:TaxExemptionReasonCode>");
    expect(xml).toContain(
      "<cbc:TaxExemptionReason>Steuerschuldnerschaft des Leistungsempfängers</cbc:TaxExemptionReason>",
    );
    expect(xml).toContain("<cbc:CompanyID>FR12345678901</cbc:CompanyID>");
    expect(xml).toContain("<cbc:IdentificationCode>FR</cbc:IdentificationCode>");
    expect(xml).toContain('<cbc:PayableAmount currencyID="EUR">1000.00</cbc:PayableAmount>');
  });

  test("credit note: positive UBL amounts, type 381 and a reference to the invoice", () => {
    const xml = generateXRechnung(creditNote());
    expect(xml).toContain("<CreditNote ");
    expect(xml).toContain("<cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>");
    expect(xml).toContain("<cac:InvoiceDocumentReference>\n<cbc:ID>INV-0001</cbc:ID>");
    expect(xml).toContain('<cbc:PayableAmount currencyID="EUR">1190.00</cbc:PayableAmount>');
    expect(xml).toContain('<cbc:CreditedQuantity unitCode="C62">10.00</cbc:CreditedQuantity>');
    expect(xml).not.toContain("-1190.00");
    expect(xml).not.toContain("<cbc:DueDate>");
  });

  test("public-sector buyer: the Leitweg-ID is the buyer reference", () => {
    const xml = generateXRechnung(publicSectorBuyer());
    expect(xml).toContain("<cbc:BuyerReference>04011000-1234512345-35</cbc:BuyerReference>");
    expect(xml).toContain("<cbc:Name>Stadt Musterstadt</cbc:Name>");
    expect(xml).not.toContain("<cbc:BuyerReference>INV-0001</cbc:BuyerReference>");
  });

  test("zero-rated supply: category Z without an exemption reason", () => {
    const data = germanB2B();
    Object.assign(data.invoice, {
      taxAmount: "0.00",
      taxRate: "0",
      taxTreatment: "zero_rated" as const,
      total: "1000.00",
    });
    const xml = generateXRechnung(data);
    expect(xml).toContain("<cbc:ID>Z</cbc:ID>");
    expect(xml).not.toContain("<cbc:TaxExemptionReason>");
  });
});

// ---------------------------------------------------------------------------
// generateXRechnung — refusals
// ---------------------------------------------------------------------------
describe("generateXRechnung refusals", () => {
  test("public-sector buyer without a Leitweg-ID", () => {
    const data = publicSectorBuyer();
    data.invoice.buyerReference = "";
    expect(() => generateXRechnung(data)).toThrow(XRechnungValidationError);
    expect(() => generateXRechnung(data)).toThrow("Leitweg-ID");
  });

  test("missing country codes are never defaulted to DE", () => {
    const data = germanB2B();
    data.client.countryCode = null;
    expect(() => generateXRechnung(data)).toThrow("buyer address needs a country code");
    const seller = germanB2B();
    seller.business.countryCode = "";
    expect(() => generateXRechnung(seller)).toThrow("seller address needs a country code");
  });

  test("seller contact must be complete", () => {
    const data = germanB2B();
    data.business.contact = { email: "anna@beispiel.de", name: "" };
    expect(() => generateXRechnung(data)).toThrow("BR-DE-2");
  });

  test("never emits an EIN in VAT fields and reports unsupported seller legal data", () => {
    const data = germanB2B();
    data.business.taxIdentifier = {
      canonicalValue: "123456789",
      countryCode: "US",
      type: "us_ein",
      value: "12-3456789",
    };
    expect(() => generateXRechnung(data)).toThrow(
      "EIN or generic tax ID cannot be exported as VAT",
    );
  });

  test("omits a client EIN from VAT-specific XML", () => {
    const data = germanB2B();
    data.client.taxIdentifier = {
      canonicalValue: "987654321",
      countryCode: "US",
      type: "us_ein",
      value: "98-7654321",
    };
    const xml = generateXRechnung(data);
    expect(xml).not.toContain("98-7654321");
    expect(xml).not.toContain("987654321");
  });

  test("lists every problem at once", () => {
    const data = publicSectorBuyer();
    data.invoice.buyerReference = null;
    data.client.countryCode = null;
    try {
      generateXRechnung(data);
      throw new Error("expected a refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(XRechnungValidationError);
      expect((error as XRechnungValidationError).problems).toHaveLength(2);
    }
  });
});

// ---------------------------------------------------------------------------
// generateXRechnung — money and payment details
// ---------------------------------------------------------------------------
describe("generateXRechnung", () => {
  test("preserves nonconforming legacy currency precision", () => {
    const data = germanB2B();
    data.invoice.currency = "JPY";
    data.invoice.lineItems[0] = {
      amount: "150.5000",
      description: "Legacy item",
      quantity: "1",
      unitPrice: "150.500000",
    };
    data.invoice.subtotal = "150.5000";
    data.invoice.taxAmount = "0.0000";
    data.invoice.total = "150.5000";

    const xml = generateXRechnung(data);
    expect(xml).toContain(
      '<cbc:LineExtensionAmount currencyID="JPY">150.50</cbc:LineExtensionAmount>',
    );
    expect(xml).toContain('<cbc:PayableAmount currencyID="JPY">150.50</cbc:PayableAmount>');

    data.invoice.currency = "ZZZ";
    expect(() => generateXRechnung(data)).not.toThrow();
  });

  test("includes IBAN and BIC when structured, and falls back to free-text bank details", () => {
    const data = germanB2B();
    data.business.iban = "DE89370400440532013000";
    data.business.bic = "COBADEFFXXX";
    data.business.bankDetails = null;

    let xml = generateXRechnung(data);
    expect(xml).toContain("<cac:PayeeFinancialAccount>");
    expect(xml).toContain("<cbc:ID>DE89370400440532013000</cbc:ID>");
    expect(xml).toContain("<cac:FinancialInstitutionBranch>\n<cbc:ID>COBADEFFXXX</cbc:ID>");

    data.business.bic = null;
    xml = generateXRechnung(data);
    expect(xml).not.toContain("<cac:FinancialInstitutionBranch>");

    const legacy = germanB2B();
    xml = generateXRechnung(legacy);
    expect(xml).toContain("<cbc:ID>DE89370400440532013000</cbc:ID>");
  });

  test("preserves fractional quantities, unit prices, and three-decimal money", () => {
    const data = germanB2B();
    Object.assign(data.invoice, {
      currency: "BHD",
      subtotal: "0.417",
      taxAmount: "0.021",
      taxRate: "5.125",
      total: "0.438",
    });
    data.invoice.lineItems[0] = {
      amount: "0.417",
      description: "Fractional service",
      quantity: "1.250000",
      unitPrice: "0.333600",
    };

    const xml = generateXRechnung(data);
    expect(xml).toContain('<cbc:InvoicedQuantity unitCode="C62">1.25</cbc:InvoicedQuantity>');
    expect(xml).toContain('<cbc:PriceAmount currencyID="BHD">0.3336</cbc:PriceAmount>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="BHD">0.438</cbc:PayableAmount>');
    expect(xml).toContain("<cbc:Percent>5.125</cbc:Percent>");
  });

  test("produces valid XML structure", () => {
    const xml = generateXRechnung(germanB2B());
    expect(xml).toStartWith('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("<Invoice ");
    expect(xml).toContain("</Invoice>");
    expect(xml).toContain("<cbc:ID>INV-0001</cbc:ID>");
    expect(xml).toContain("<cbc:IssueDate>2026-10-01</cbc:IssueDate>");
    expect(xml).toContain("<cbc:DueDate>2026-10-31</cbc:DueDate>");
  });

  test("includes notes only when provided and omits the period when unset", () => {
    expect(generateXRechnung(germanB2B())).toContain("<cbc:Note>Vielen Dank</cbc:Note>");
    const data = germanB2B();
    data.invoice.notes = null;
    data.invoice.servicePeriodStart = null;
    data.invoice.servicePeriodEnd = null;
    const xml = generateXRechnung(data);
    expect(xml).not.toContain("<cbc:Note>");
    expect(xml).not.toContain("<cac:InvoicePeriod>");
  });
});
