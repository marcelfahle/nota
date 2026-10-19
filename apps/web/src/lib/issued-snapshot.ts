import { formatOrgAddress } from "@/lib/branding";
import type { ComplianceInput } from "@/lib/invoice-compliance";
import { orgCountryCode } from "@/lib/invoice-compliance";
import { clientPostalAddress, formatClientAddress, orgPostalAddress } from "@/lib/postal-address";
import type { TaxIdentifier } from "@/lib/tax-identifier";
import type { TaxTreatment } from "@/lib/tax-treatment";

/**
 * What an issued invoice said about its parties, frozen on the invoice row at
 * issuance. The renderers read this, never the live workspace or client, so a
 * later settings edit cannot change an issued document. Drafts get the same
 * shape built from the live rows on every render.
 */
export type IssuedSnapshot = {
  bank: { bic: string | null; details: string | null; iban: string | null } | null;
  buyer: {
    /** Address lines as printed on the PDF. */
    address: string | null;
    city: string | null;
    company: string | null;
    countryCode: string | null;
    email: string;
    name: string;
    postalCode: string | null;
    publicSector: boolean;
    street: string | null;
    taxIdentifier: TaxIdentifier | null;
  };
  seller: {
    /** Address lines as printed on the PDF. */
    address: string | null;
    brandColor: string | null;
    city: string | null;
    contactEmail: string | null;
    contactName: string | null;
    contactPhone: string | null;
    countryCode: string | null;
    logoUrl: string | null;
    name: string;
    postalCode: string | null;
    street: string | null;
    taxIdentifier: TaxIdentifier | null;
  };
  totals: {
    currency: string;
    subtotal: string;
    taxAmount: string;
    taxRate: string;
    taxTreatment: TaxTreatment;
    total: string;
  };
  version: 1;
};

export type SnapshotOrg = {
  brandColor?: string | null;
  businessAddress?: string | null;
  businessName?: string | null;
  city?: string | null;
  contactEmail?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  country?: string | null;
  countryCode?: string | null;
  legalName?: string | null;
  logoUrl?: string | null;
  name: string;
  postalCode?: string | null;
  street?: string | null;
};

export type SnapshotClient = {
  address?: string | null;
  city?: string | null;
  company?: string | null;
  countryCode?: string | null;
  email: string;
  name: string;
  postalCode?: string | null;
  publicSector?: boolean | null;
  street?: string | null;
};

export type SnapshotInvoice = {
  currency?: string | null;
  subtotal?: string | null;
  taxAmount?: string | null;
  taxRate?: string | null;
  taxTreatment: TaxTreatment;
  total?: string | null;
};

export function buildIssuedSnapshot(input: {
  bankAccount: IssuedSnapshot["bank"];
  client: SnapshotClient;
  clientTaxIdentifier: TaxIdentifier | null;
  invoice: SnapshotInvoice;
  org: SnapshotOrg;
  sellerTaxIdentifier: TaxIdentifier | null;
}): IssuedSnapshot {
  const { bankAccount, client, invoice, org } = input;
  const sellerPostal = orgPostalAddress(org);
  const buyerPostal = clientPostalAddress(client);
  return {
    bank: bankAccount
      ? {
          bic: bankAccount.bic ?? null,
          details: bankAccount.details ?? null,
          iban: bankAccount.iban ?? null,
        }
      : null,
    buyer: {
      address: formatClientAddress(client),
      city: buyerPostal.city ?? null,
      company: client.company ?? null,
      countryCode: buyerPostal.countryCode ?? null,
      email: client.email,
      name: client.name,
      postalCode: buyerPostal.postalCode ?? null,
      publicSector: client.publicSector ?? false,
      street: buyerPostal.street ?? null,
      taxIdentifier: input.clientTaxIdentifier,
    },
    seller: {
      address: formatOrgAddress(org),
      brandColor: org.brandColor ?? null,
      city: sellerPostal.city ?? null,
      contactEmail: org.contactEmail ?? null,
      contactName: org.contactName ?? null,
      contactPhone: org.contactPhone ?? null,
      countryCode: orgCountryCode(org) ?? sellerPostal.countryCode ?? null,
      logoUrl: org.logoUrl ?? null,
      name: org.legalName ?? org.businessName ?? org.name,
      postalCode: sellerPostal.postalCode ?? null,
      street: sellerPostal.street ?? null,
      taxIdentifier: input.sellerTaxIdentifier,
    },
    totals: {
      currency: invoice.currency ?? "EUR",
      subtotal: invoice.subtotal ?? "0.00",
      taxAmount: invoice.taxAmount ?? "0.00",
      taxRate: invoice.taxRate ?? "0.00",
      taxTreatment: invoice.taxTreatment,
      total: invoice.total ?? "0.00",
    },
    version: 1,
  };
}

/** Compliance checks on an issued document run against what it said, not what the rows say now. */
export function complianceFromSnapshot(
  snapshot: IssuedSnapshot,
  invoice: {
    buyerReference: string | null;
    kind: "credit_note" | "invoice";
    servicePeriodEnd: string | null;
    servicePeriodStart: string | null;
  },
  lineItemCount: number,
): ComplianceInput {
  const { bank, buyer, seller, totals } = snapshot;
  return {
    bankAccount: bank,
    client: {
      address: buyer.address,
      city: buyer.city,
      company: buyer.company,
      countryCode: buyer.countryCode,
      name: buyer.name,
      postalCode: buyer.postalCode,
      publicSector: buyer.publicSector,
      street: buyer.street,
      taxIdentifier: buyer.taxIdentifier,
    },
    invoice: {
      buyerReference: invoice.buyerReference,
      issued: true,
      kind: invoice.kind,
      lineItemCount,
      servicePeriodEnd: invoice.servicePeriodEnd,
      servicePeriodStart: invoice.servicePeriodStart,
      taxRate: totals.taxRate,
      taxTreatment: totals.taxTreatment,
    },
    org: {
      businessName: seller.name,
      city: seller.city,
      contactEmail: seller.contactEmail,
      contactName: seller.contactName,
      contactPhone: seller.contactPhone,
      countryCode: seller.countryCode,
      legalName: seller.name,
      name: seller.name,
      postalCode: seller.postalCode,
      street: seller.street,
      taxIdentifier: seller.taxIdentifier,
    },
  };
}
