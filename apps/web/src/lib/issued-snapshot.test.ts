import { expect, test } from "bun:test";

import { validateForXRechnung } from "@/lib/invoice-compliance";
import {
  buildIssuedSnapshot,
  complianceFromSnapshot,
  displayedBuyer,
  displayedSellerAddress,
} from "@/lib/issued-snapshot";
import { formatClientAddress } from "@/lib/postal-address";

const org = {
  brandColor: "#112233",
  businessAddress: "Old free text, 10115 Berlin",
  businessName: "Beispiel Studio",
  city: "Berlin",
  contactEmail: "anna@beispiel.de",
  contactName: "Anna Beispiel",
  contactPhone: "+49 30 1234567",
  country: "Germany",
  countryCode: "DE",
  legalName: "Beispiel GmbH",
  logoUrl: "https://store/orgs/1/logo.png",
  name: "Beispiel",
  postalCode: "10115",
  street: "Musterstraße 1",
};
const client = {
  address: null,
  city: "Hamburg",
  company: "Kunde AG",
  countryCode: "DE",
  email: "max@kunde.de",
  name: "Max Kunde",
  postalCode: "20095",
  publicSector: false,
  street: "Hafenweg 2",
};
const sellerTaxIdentifier = {
  canonicalValue: "DE123456789",
  countryCode: "DE",
  type: "eu_vat" as const,
  value: "DE123456789",
};
const invoice = {
  currency: "EUR",
  subtotal: "100.0000",
  taxAmount: "19.0000",
  taxRate: "19.000000",
  taxTreatment: "standard" as const,
  total: "119.0000",
};

test("the snapshot holds seller, buyer, bank and totals exactly as rendered", () => {
  const snapshot = buildIssuedSnapshot({
    bankAccount: { bic: "COBADEFFXXX", details: "Commerzbank", iban: "DE89370400440532013000" },
    client,
    clientTaxIdentifier: null,
    invoice,
    org,
    sellerTaxIdentifier,
  });
  expect(snapshot.version).toBe(1);
  expect(snapshot.seller).toEqual({
    address: "Musterstraße 1\n10115 Berlin\nGermany",
    brandColor: "#112233",
    city: "Berlin",
    contactEmail: "anna@beispiel.de",
    contactName: "Anna Beispiel",
    contactPhone: "+49 30 1234567",
    countryCode: "DE",
    logoUrl: "https://store/orgs/1/logo.png",
    name: "Beispiel GmbH",
    postalCode: "10115",
    street: "Musterstraße 1",
    taxIdentifier: sellerTaxIdentifier,
  });
  expect(snapshot.buyer).toEqual({
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
  });
  expect(snapshot.bank).toEqual({
    bic: "COBADEFFXXX",
    details: "Commerzbank",
    iban: "DE89370400440532013000",
  });
  expect(snapshot.totals).toEqual({
    currency: "EUR",
    subtotal: "100.0000",
    taxAmount: "19.0000",
    taxRate: "19.000000",
    taxTreatment: "standard",
    total: "119.0000",
  });
});

test("a legacy free-text address is split the same way the XML would split it", () => {
  const snapshot = buildIssuedSnapshot({
    bankAccount: null,
    client: {
      address: "Rue de la Paix 5\n75002 Paris\nFrance",
      countryCode: null,
      email: "jean@client.fr",
      name: "Jean Client",
    },
    clientTaxIdentifier: null,
    invoice,
    org: {
      ...org,
      businessAddress: "Altstraße 9, 80331 München",
      city: null,
      country: null,
      postalCode: null,
      street: null,
    },
    sellerTaxIdentifier,
  });
  expect(snapshot.buyer.address).toBe("Rue de la Paix 5\n75002 Paris\nFrance");
  expect(snapshot.buyer.countryCode).toBe("FR");
  expect(snapshot.seller.address).toBe("Altstraße 9, 80331 München");
  expect(snapshot.seller.countryCode).toBe("DE");
  expect(snapshot.bank).toBeNull();
});

test("compliance on an issued document is judged from the snapshot alone", () => {
  const snapshot = buildIssuedSnapshot({
    bankAccount: { bic: null, details: null, iban: "DE89370400440532013000" },
    client,
    clientTaxIdentifier: null,
    invoice,
    org,
    sellerTaxIdentifier,
  });
  const complete = complianceFromSnapshot(
    snapshot,
    {
      buyerReference: null,
      kind: "invoice",
      servicePeriodEnd: "2026-09-30",
      servicePeriodStart: "2026-09-01",
    },
    1,
  );
  expect(validateForXRechnung(complete)).toEqual([]);

  const withoutPhone = complianceFromSnapshot(
    { ...snapshot, seller: { ...snapshot.seller, contactPhone: null } },
    complete.invoice,
    1,
  );
  expect(validateForXRechnung(withoutPhone)).toContain(
    "Add a contact phone number for your business in Settings.",
  );
});

test("screens show the issued buyer and seller address, and the live ones on a draft", () => {
  const snapshot = buildIssuedSnapshot({
    bankAccount: null,
    client,
    clientTaxIdentifier: null,
    invoice,
    org,
    sellerTaxIdentifier,
  });
  const movedClient = {
    ...client,
    city: "München",
    name: "Max Umgezogen",
    postalCode: "80331",
    street: "Neue Straße 99",
  };
  const movedOrg = { ...org, street: "Andere Allee 7" };

  const issued = { issuedSnapshot: snapshot, status: "sent" };
  const shown = displayedBuyer(issued, movedClient);
  expect(shown.name).toBe("Max Kunde");
  expect(formatClientAddress(shown)).toBe("Hafenweg 2\n20095 Hamburg\nDE");
  expect(displayedSellerAddress(issued, movedOrg)).toBe("Musterstraße 1\n10115 Berlin\nGermany");

  const draft = { issuedSnapshot: null, status: "draft" };
  expect(displayedBuyer(draft, movedClient)).toBe(movedClient);
  expect(formatClientAddress(displayedBuyer(draft, movedClient))).toBe(
    "Neue Straße 99\n80331 München\nDE",
  );
  expect(displayedSellerAddress(draft, movedOrg)).toBe("Andere Allee 7\n10115 Berlin\nGermany");

  // Issued before snapshots existed: nothing to freeze, the rows are shown.
  const legacy = { issuedSnapshot: null, status: "paid" };
  expect(displayedBuyer(legacy, movedClient)).toBe(movedClient);
});
