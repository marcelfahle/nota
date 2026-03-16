import { describe, expect, test } from "bun:test";

import { escapeXml, extractIban, generateXRechnung, parseAddress, toCountryCode } from "@/lib/xrechnung";

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
      vatNumber: "DE123456789",
    },
    client: {
      address: "Client St 5\n28001 Madrid\nSpain",
      company: "Client Corp",
      email: "client@example.com",
      name: "Jane Doe",
      vatNumber: "ESB12345678",
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
    expect(escapeXml('A & B < C > D "E" \'F\'')).toBe(
      "A &amp; B &lt; C &gt; D &quot;E&quot; &apos;F&apos;",
    );
  });

  test("leaves plain text unchanged", () => {
    expect(escapeXml("Hello World")).toBe("Hello World");
  });
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
    expect(xml).toContain(
      "<cbc:TaxExemptionReasonCode>vatex-eu-ae</cbc:TaxExemptionReasonCode>",
    );
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

  test("produces valid XML structure", () => {
    const xml = generateXRechnung(baseData());
    expect(xml).toStartWith('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("<Invoice ");
    expect(xml).toContain("</Invoice>");
    expect(xml).toContain("<cbc:ID>INV-0001</cbc:ID>");
    expect(xml).toContain("<cbc:IssueDate>2025-01-15</cbc:IssueDate>");
    expect(xml).toContain("<cbc:DueDate>2025-02-28</cbc:DueDate>");
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
