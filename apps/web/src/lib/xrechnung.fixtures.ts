import type { XRechnungData } from "@/lib/xrechnung";

/**
 * The German invoice scenarios Nota supports, as input for `generateXRechnung`.
 * The unit tests and `scripts/validate-xrechnung.ts` share them, so what the
 * official KoSIT validator accepts is exactly what the tests describe.
 *
 * The IBAN is the well-known valid example, so BR-DE-19 (a SEPA transfer needs
 * a correct IBAN) stays quiet. A made-up IBAN only produces a warning there.
 */

/** Ordinary German B2B invoice at 19%. The base every other scenario adjusts. */
export function germanB2B(): XRechnungData {
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

/** Kleinunternehmer (§ 19 UStG): no VAT, a Steuernummer instead of a VAT ID. */
export function kleinunternehmer(): XRechnungData {
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

/** Reverse charge to a business customer in another EU country (§ 13b UStG). */
export function reverseChargeToFrance(): XRechnungData {
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

/** Credit note for the B2B invoice. Nota stores negative amounts; UBL wants positive ones. */
export function creditNote(): XRechnungData {
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

/** A Behörde as buyer: its Leitweg-ID is the buyer reference (BT-10). */
export function publicSectorBuyer(): XRechnungData {
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

/** Several lines at 7% with fractional quantities, for work spread over three months. */
export function multiMonthPeriod(): XRechnungData {
  const data = germanB2B();
  Object.assign(data.invoice, {
    lineItems: [
      {
        amount: "700.00",
        description: "Workshop-Tage Juli und August 2026",
        quantity: "2",
        unitPrice: "350.00",
      },
      {
        amount: "300.00",
        description: "Nachbereitung September 2026",
        quantity: "1.5",
        unitPrice: "200.00",
      },
    ],
    notes: null,
    number: "INV-0002",
    servicePeriodEnd: "2026-09-30",
    servicePeriodStart: "2026-07-15",
    subtotal: "1000.00",
    taxAmount: "70.00",
    taxRate: "7",
    total: "1070.00",
  });
  return data;
}

/** Every scenario the KoSIT validator run covers, keyed by the file name it produces. */
export const XRECHNUNG_FIXTURES: Record<string, () => XRechnungData> = {
  "credit-note": creditNote,
  "german-b2b-19": germanB2B,
  kleinunternehmer,
  "multi-month-period-7": multiMonthPeriod,
  "public-sector-leitweg-id": publicSectorBuyer,
  "reverse-charge-eu": reverseChargeToFrance,
};
