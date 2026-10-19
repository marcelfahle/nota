import { expect, mock, test } from "bun:test";

import { bankAccounts, clients, invoices, lineItems } from "@/lib/db/schema";

// A fake database that answers by table: an issued invoice with a snapshot, a
// client that has since moved, and a bank account that has since changed.
const snapshot = {
  bank: { bic: "COBADEFFXXX", details: "Commerzbank", iban: "DE89370400440532013000" },
  buyer: {
    address: "Hafenweg 2\n20095 Hamburg\nDE",
    city: "Hamburg",
    company: "Kunde AG",
    countryCode: "DE",
    email: "max@kunde.de",
    name: "Max Kunde",
    postalCode: "20095",
    publicSector: false,
    street: "Hafenweg 2",
    taxIdentifier: null,
  },
  seller: {
    address: "Musterstraße 1\n10115 Berlin\nGermany",
    brandColor: "#112233",
    city: "Berlin",
    contactEmail: "anna@beispiel.de",
    contactName: "Anna Beispiel",
    contactPhone: "+49 30 1234567",
    countryCode: "DE",
    logoUrl: null,
    name: "Beispiel GmbH",
    postalCode: "10115",
    street: "Musterstraße 1",
    taxIdentifier: {
      canonicalValue: "DE123456789",
      countryCode: "DE",
      type: "eu_vat" as const,
      value: "DE123456789",
    },
  },
  totals: {
    currency: "EUR",
    subtotal: "100.0000",
    taxAmount: "19.0000",
    taxRate: "19.000000",
    taxTreatment: "standard" as const,
    total: "119.0000",
  },
  version: 1 as const,
};
let invoiceRow: Record<string, unknown> = {};
const clientRow = {
  address: null,
  bankAccountId: null,
  city: "München",
  company: "Kunde AG",
  countryCode: "DE",
  email: "max@kunde.de",
  id: "client-1",
  name: "Moritz Umgezogen",
  postalCode: "80331",
  publicSector: false,
  street: "Neue Straße 99",
  taxIdentifierCanonicalValue: null,
  taxIdentifierCountryCode: null,
  taxIdentifierType: null,
  taxIdentifierValue: null,
  vatNumber: null,
};
const queriedTables: Array<unknown> = [];

function chain(result: Array<unknown>) {
  const step: Record<string, unknown> = {};
  for (const name of ["limit", "orderBy", "where"]) {
    step[name] = () => chain(result);
  }
  step.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return step;
}
mock.module("@/lib/db", () => ({
  db: {
    select: () => ({
      from: (table: unknown) => {
        queriedTables.push(table);
        if (table === invoices) {
          return chain([invoiceRow]);
        }
        if (table === clients) {
          return chain([clientRow]);
        }
        if (table === lineItems) {
          return chain([
            {
              amount: "100.0000",
              description: "Work",
              id: "line-1",
              invoiceId: "inv-1",
              quantity: "1.000000",
              sortOrder: 0,
              unitPrice: "100.000000",
            },
          ]);
        }
        if (table === bankAccounts) {
          return chain([{ bic: "NEWBIC", details: "changed", iban: "DE02120300000000202051" }]);
        }
        return chain([]);
      },
    }),
  },
}));

const { loadInvoiceDocument } = await import("./invoice-document");

const org = {
  brandColor: "#000000",
  businessAddress: null,
  businessName: "Umfirmiert",
  city: "Köln",
  contactEmail: "neu@beispiel.de",
  contactName: "Neu",
  contactPhone: "+49 221 1",
  country: "Germany",
  countryCode: "DE",
  id: "org-1",
  legalName: "Umfirmiert GmbH",
  logoUrl: null,
  name: "Umfirmiert",
  postalCode: "50667",
  region: null,
  street: "Andere Allee 7",
  taxIdentifierCanonicalValue: "DE999999999",
  taxIdentifierCountryCode: "DE",
  taxIdentifierType: "eu_vat",
  taxIdentifierValue: "DE999999999",
  vatNumber: "DE999999999",
};
const baseInvoice = {
  buyerReference: null,
  clientId: "client-1",
  clientTaxIdentifier: null,
  creditsInvoiceId: null,
  currency: "EUR",
  dueAt: "2026-10-31",
  id: "inv-1",
  issuedAt: "2026-10-01",
  kind: "invoice",
  notes: null,
  number: "INV-0007",
  orgId: "org-1",
  sellerTaxIdentifier: snapshot.seller.taxIdentifier,
  servicePeriodEnd: "2026-09-30",
  servicePeriodStart: "2026-09-01",
  stripePaymentLinkUrl: null,
  subtotal: "100.0000",
  taxAmount: "19.0000",
  taxRate: "19.000000",
  taxTreatment: "standard",
  total: "119.0000",
};

test("an issued invoice renders from its snapshot, not from the rows as they are now", async () => {
  invoiceRow = { ...baseInvoice, issuedSnapshot: snapshot, status: "sent" };
  queriedTables.length = 0;
  const document = await loadInvoiceDocument(org, "inv-1");
  expect(document.frozen).toBe(true);
  expect(document.seller.name).toBe("Beispiel GmbH");
  expect(document.seller.address).toBe("Musterstraße 1\n10115 Berlin\nGermany");
  expect(document.buyer.name).toBe("Max Kunde");
  expect(document.buyer.street).toBe("Hafenweg 2");
  expect(document.bank?.iban).toBe("DE89370400440532013000");
  expect(document.filename("pdf")).toBe("inv-0007-max-2026-10-01.pdf");
  // The live bank account is not even read.
  expect(queriedTables).not.toContain(bankAccounts);
  expect(document.compliance.org.contactPhone).toBe("+49 30 1234567");
});

test("a draft renders from the live rows", async () => {
  invoiceRow = { ...baseInvoice, issuedSnapshot: null, number: "DRAFT-1", status: "draft" };
  queriedTables.length = 0;
  const document = await loadInvoiceDocument(org, "inv-1");
  expect(document.frozen).toBe(false);
  expect(document.seller.name).toBe("Umfirmiert GmbH");
  expect(document.buyer.name).toBe("Moritz Umgezogen");
  expect(document.buyer.street).toBe("Neue Straße 99");
  expect(document.bank?.iban).toBe("DE02120300000000202051");
  expect(queriedTables).toContain(bankAccounts);
});

test("an invoice issued before snapshots existed keeps rendering live, with its frozen tax ids", async () => {
  invoiceRow = { ...baseInvoice, issuedSnapshot: null, status: "paid" };
  const document = await loadInvoiceDocument(org, "inv-1");
  expect(document.frozen).toBe(false);
  expect(document.seller.name).toBe("Umfirmiert GmbH");
  expect(document.seller.taxIdentifier?.value).toBe("DE123456789");
  expect(document.buyer.name).toBe("Moritz Umgezogen");
});
