import { describe, expect, test } from "bun:test";

import {
  escapeXml,
  extractIban,
  generateXRechnung,
  parseAddress,
  toCountryCode,
} from "@/lib/xrechnung";

// ---------------------------------------------------------------------------
// Shared fixture
// ---------------------------------------------------------------------------
function baseData() {
  return {
    business: {
      address: "Musterstraße 1\n10115 Berlin\nGermany",
      bankDetails: "IBAN: DE89370400440532013000\nBIC: COBADEFFXXX",
      email: "test@example.com",
      name: "Test GmbH",
      taxIdentifier: {
        canonicalValue: "DE123456789",
        countryCode: "DE",
        type: "eu_vat" as const,
        value: "DE123456789",
      },
    },
    client: {
      address: "Client St 5\n28001 Madrid\nSpain",
      company: "Client Corp",
      email: "client@example.com",
      name: "Jane Doe",
      taxIdentifier: {
        canonicalValue: "ESB12345678",
        countryCode: "ES",
        type: "eu_vat" as const,
        value: "ESB12345678",
      },
    },
    invoice: {
      currency: "EUR",
      dueAt: "2025-02-28",
      issuedAt: "2025-01-15",
      lineItems: [
        { amount: "1000.00", description: "Consulting", quantity: "10", unitPrice: "100.00" },
      ],
      notes: "Thank you",
      number: "INV-0001",
      paymentLinkUrl: null,
      reverseCharge: null,
      subtotal: "1000.00",
      taxAmount: "190.00",
      taxRate: "19",
      total: "1190.00",
    },
  };
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

test("never emits an EIN in VAT fields and reports unsupported seller legal data", () => {
  const data = baseData();
  data.business.taxIdentifier = {
    canonicalValue: "123456789",
    countryCode: "US",
    type: "us_ein",
    value: "12-3456789",
  };

  expect(() => generateXRechnung(data)).toThrow("EIN or generic tax ID cannot be exported as VAT");
});

test("omits a client EIN from VAT-specific XML", () => {
  const data = baseData();
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

// ---------------------------------------------------------------------------
// toCountryCode
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
    expect(toCountryCode("FR")).toBe("FR");
  });

  test("falls back to first 2 chars uppercased for unknown", () => {
    expect(toCountryCode("Narnia")).toBe("NA");
  });
});

// ---------------------------------------------------------------------------
// parseAddress
// ---------------------------------------------------------------------------
describe("parseAddress", () => {
  test("returns empty for null/undefined", () => {
    expect(parseAddress(null)).toEqual({ city: "", country: "", postal: "", street: "" });
    expect(parseAddress(undefined)).toEqual({ city: "", country: "", postal: "", street: "" });
  });

  test("parses 1-line address as street only", () => {
    expect(parseAddress("123 Main St")).toEqual({
      city: "",
      country: "",
      postal: "",
      street: "123 Main St",
    });
  });

  test("parses 2-line address as street + city/postal", () => {
    const result = parseAddress("Main St 1\n10115 Berlin");
    expect(result.street).toBe("Main St 1");
    expect(result.postal).toBe("10115");
    expect(result.city).toBe("Berlin");
    expect(result.country).toBe("");
  });

  test("parses 3-line address with country", () => {
    const result = parseAddress("Main St 1\n10115 Berlin\nGermany");
    expect(result.street).toBe("Main St 1");
    expect(result.postal).toBe("10115");
    expect(result.city).toBe("Berlin");
    expect(result.country).toBe("DE");
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
// generateXRechnung — structured IBAN
// ---------------------------------------------------------------------------
describe("generateXRechnung", () => {
  test("preserves nonconforming legacy currency precision", () => {
    const data = baseData();
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

  test("includes IBAN in PayeeFinancialAccount when structured iban provided", () => {
    const data = baseData();
    data.business.iban = "DE89370400440532013000";
    data.business.bankDetails = null;

    const xml = generateXRechnung(data);
    expect(xml).toContain("<cac:PayeeFinancialAccount>");
    expect(xml).toContain("<cbc:ID>DE89370400440532013000</cbc:ID>");
  });

  test("includes BIC in FinancialInstitutionBranch when provided", () => {
    const data = baseData();
    data.business.iban = "DE89370400440532013000";
    data.business.bic = "COBADEFFXXX";
    data.business.bankDetails = null;

    const xml = generateXRechnung(data);
    expect(xml).toContain("<cac:FinancialInstitutionBranch>");
    expect(xml).toContain("<cbc:ID>COBADEFFXXX</cbc:ID>");
  });

  test("omits FinancialInstitutionBranch when no BIC", () => {
    const data = baseData();
    data.business.iban = "DE89370400440532013000";
    data.business.bic = null;
    data.business.bankDetails = null;

    const xml = generateXRechnung(data);
    expect(xml).not.toContain("<cac:FinancialInstitutionBranch>");
  });

  test("falls back to extractIban from bankDetails when no structured iban", () => {
    const data = baseData();
    // bankDetails has IBAN embedded, no structured iban field
    data.business.iban = null;
    data.business.bic = null;

    const xml = generateXRechnung(data);
    expect(xml).toContain("<cac:PayeeFinancialAccount>");
    expect(xml).toContain("<cbc:ID>DE89370400440532013000</cbc:ID>");
  });

  test("reverse charge uses AE tax category + exemption reason", () => {
    const data = baseData();
    data.invoice.reverseCharge = "true";
    data.invoice.taxRate = "0";
    data.invoice.taxAmount = "0.00";
    data.invoice.total = "1000.00";

    const xml = generateXRechnung(data);
    expect(xml).toContain("<cbc:ID>AE</cbc:ID>");
    expect(xml).toContain("<cbc:TaxExemptionReason>Reverse charge</cbc:TaxExemptionReason>");
    expect(xml).toContain("<cbc:TaxExemptionReasonCode>vatex-eu-ae</cbc:TaxExemptionReasonCode>");
  });

  test("zero tax uses Z category", () => {
    const data = baseData();
    data.invoice.taxRate = "0";
    data.invoice.taxAmount = "0.00";
    data.invoice.total = "1000.00";

    const xml = generateXRechnung(data);
    expect(xml).toContain("<cbc:ID>Z</cbc:ID>");
    expect(xml).not.toContain("<cbc:TaxExemptionReason>");
  });

  test("standard tax uses S category with correct percent", () => {
    const data = baseData();
    const xml = generateXRechnung(data);
    expect(xml).toContain("<cbc:ID>S</cbc:ID>");
    expect(xml).toContain("<cbc:Percent>19.00</cbc:Percent>");
  });

  test("preserves fractional quantities, unit prices, and three-decimal money", () => {
    const data = baseData();
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
    const xml = generateXRechnung(baseData());
    expect(xml).toStartWith('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("<Invoice ");
    expect(xml).toContain("</Invoice>");
    expect(xml).toContain("<cbc:ID>INV-0001</cbc:ID>");
    expect(xml).toContain("<cbc:IssueDate>2025-01-15</cbc:IssueDate>");
    expect(xml).toContain("<cbc:DueDate>2025-02-28</cbc:DueDate>");
  });

  test("renders a credit note with positive UBL amounts and an invoice reference", () => {
    const data = baseData();
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

    const xml = generateXRechnung(data);
    expect(xml).toContain("<CreditNote ");
    expect(xml).toContain("<cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>");
    expect(xml).toContain("<cbc:ID>INV-0001</cbc:ID>");
    expect(xml).toContain('<cbc:PayableAmount currencyID="EUR">1190.00</cbc:PayableAmount>');
    expect(xml).not.toContain("-1190.00");
  });

  test("includes invoice notes", () => {
    const xml = generateXRechnung(baseData());
    expect(xml).toContain("<cbc:Note>Thank you</cbc:Note>");
  });

  test("omits notes when not provided", () => {
    const data = baseData();
    data.invoice.notes = null;
    const xml = generateXRechnung(data);
    expect(xml).not.toContain("<cbc:Note>");
  });
});
