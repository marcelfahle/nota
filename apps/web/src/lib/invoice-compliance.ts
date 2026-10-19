import { invoiceTaxIdentifier, isViesCountry, type TaxIdentifier } from "@/lib/tax-identifier";
import { requiresZeroRate, TAX_TREATMENT_LABELS, type TaxTreatment } from "@/lib/tax-treatment";
import { extractIban, toCountryCode } from "@/lib/xrechnung";

/**
 * One place that says what a German invoice needs before it may be issued or
 * exported as XRechnung. Every surface (web, REST, chat, SDK, MCP) shows the
 * same plain-English problems. Drafts may be incomplete; issued documents may
 * not. Sources: § 14 UStG (mandatory invoice content), § 19 UStG
 * (Kleinunternehmer), § 13b UStG (reverse charge), XRechnung 3.0 BR-DE rules.
 */

export type ComplianceOrg = {
  businessName?: string | null;
  city?: string | null;
  contactEmail?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  countryCode?: string | null;
  legalName?: string | null;
  name: string;
  postalCode?: string | null;
  street?: string | null;
  taxIdentifier: TaxIdentifier | null;
};

export type ComplianceClient = {
  address?: string | null;
  city?: string | null;
  company?: string | null;
  countryCode?: string | null;
  name: string;
  postalCode?: string | null;
  publicSector?: boolean | null;
  street?: string | null;
  taxIdentifier: TaxIdentifier | null;
};

export type ComplianceInvoice = {
  buyerReference?: string | null;
  /** Issued documents are frozen; rules that need an edit are not raised against them. */
  issued?: boolean;
  kind?: "credit_note" | "invoice";
  lineItemCount: number;
  servicePeriodEnd?: string | null;
  servicePeriodStart?: string | null;
  taxRate: string | number | null | undefined;
  taxTreatment: TaxTreatment;
};

/** The account the invoice is paid to: the client's assigned one, else the workspace default. */
export type ComplianceBankAccount = {
  details?: string | null;
  iban?: string | null;
};

export type ComplianceInput = {
  bankAccount: ComplianceBankAccount | null;
  client: ComplianceClient;
  invoice: ComplianceInvoice;
  org: ComplianceOrg;
};

export function isGermanOrg(org: Pick<ComplianceOrg, "countryCode">) {
  return org.countryCode?.toUpperCase() === "DE";
}

type OrgColumns = {
  businessName: string | null;
  city: string | null;
  contactEmail: string | null;
  contactName: string | null;
  contactPhone: string | null;
  country: string | null;
  countryCode: string | null;
  legalName: string | null;
  name: string;
  postalCode: string | null;
  street: string | null;
  taxIdentifierCanonicalValue?: string | null;
  taxIdentifierCountryCode?: string | null;
  taxIdentifierType?: string | null;
  taxIdentifierValue?: string | null;
  vatNumber?: string | null;
};

type ClientColumns = {
  address: string | null;
  city: string | null;
  company: string | null;
  countryCode: string | null;
  name: string;
  postalCode: string | null;
  publicSector: boolean;
  street: string | null;
  taxIdentifierCanonicalValue?: string | null;
  taxIdentifierCountryCode?: string | null;
  taxIdentifierType?: string | null;
  taxIdentifierValue?: string | null;
  vatNumber?: string | null;
};

type InvoiceColumns = {
  buyerReference: string | null;
  clientTaxIdentifier: TaxIdentifier | null;
  kind: "credit_note" | "invoice";
  sellerTaxIdentifier: TaxIdentifier | null;
  servicePeriodEnd: string | null;
  servicePeriodStart: string | null;
  status: string | null;
  taxRate: string | null;
  taxTreatment: TaxTreatment;
};

/** The workspace's ISO country: the stored code, or the free-text name when it is unambiguous. */
export function orgCountryCode(org: { country?: string | null; countryCode?: string | null }) {
  return org.countryCode?.trim() || (org.country ? toCountryCode(org.country) : null);
}

/** Builds the validation input from database rows. The one place that knows the column names. */
export function complianceInput(
  org: OrgColumns,
  client: ClientColumns,
  invoice: InvoiceColumns,
  lineItemCount: number,
  bankAccount: ComplianceBankAccount | null,
): ComplianceInput {
  return {
    bankAccount,
    client: {
      address: client.address,
      city: client.city,
      company: client.company,
      countryCode: client.countryCode,
      name: client.name,
      postalCode: client.postalCode,
      publicSector: client.publicSector,
      street: client.street,
      taxIdentifier: invoiceTaxIdentifier(invoice.status, invoice.clientTaxIdentifier, client),
    },
    invoice: {
      buyerReference: invoice.buyerReference,
      issued: invoice.status !== "draft",
      kind: invoice.kind,
      lineItemCount,
      servicePeriodEnd: invoice.servicePeriodEnd,
      servicePeriodStart: invoice.servicePeriodStart,
      taxRate: invoice.taxRate,
      taxTreatment: invoice.taxTreatment,
    },
    org: {
      businessName: org.businessName,
      city: org.city,
      contactEmail: org.contactEmail,
      contactName: org.contactName,
      contactPhone: org.contactPhone,
      countryCode: orgCountryCode(org),
      legalName: org.legalName,
      name: org.name,
      postalCode: org.postalCode,
      street: org.street,
      taxIdentifier: invoiceTaxIdentifier(invoice.status, invoice.sellerTaxIdentifier, org),
    },
  };
}

/** ISO 13616 mod-97 check. Spaces are ignored; anything else must already be clean. */
export function isValidIban(value: string): boolean {
  const iban = value.replaceAll(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) {
    return false;
  }
  let remainder = 0;
  for (const char of iban.slice(4) + iban.slice(0, 4)) {
    const digits = /\d/.test(char) ? char : String(char.charCodeAt(0) - 55);
    for (const digit of digits) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }
  return remainder === 1;
}

/**
 * The XRechnung announces a SEPA transfer, so BR-61 and BR-DE-23 demand an
 * account and BR-DE-19 a correct IBAN. The IBAN is read the way the export
 * reads it: the structured column first, else the first one in the free text.
 */
function bankProblems(bankAccount: ComplianceBankAccount | null, required: boolean) {
  const iban = bankAccount?.iban?.trim() || extractIban(bankAccount?.details);
  if (!iban) {
    return required ? ["Add a bank account with an IBAN in Settings."] : [];
  }
  return isValidIban(iban)
    ? []
    : ["The IBAN on your bank account is not valid. Fix it in Settings."];
}

function hasStructuredAddress(party: {
  city?: string | null;
  postalCode?: string | null;
  street?: string | null;
}) {
  return Boolean(party.street?.trim() && party.postalCode?.trim() && party.city?.trim());
}

/**
 * A treatment and a rate that contradict each other are never saved, not even
 * as a draft, because the totals would be wrong.
 */
export function taxTreatmentConflict(
  treatment: TaxTreatment,
  taxRate: string | number | null | undefined,
): string | null {
  if (requiresZeroRate(treatment) && Number(taxRate ?? 0) !== 0) {
    return `${TAX_TREATMENT_LABELS[treatment]} invoices carry no VAT. Set the tax rate to 0 or choose standard VAT.`;
  }
  return null;
}

// § 14 Abs. 4 Nr. 1 and 2 UStG plus the XRechnung seller contact (BR-DE-2, 5, 7).
function sellerProblems(org: ComplianceOrg) {
  const problems: Array<string> = [];
  if (!(org.legalName?.trim() || org.businessName?.trim())) {
    problems.push("Add your legal or business name in Settings.");
  }
  if (!hasStructuredAddress(org)) {
    problems.push("Add your street, postal code and city in Settings.");
  }
  if (!org.countryCode?.trim()) {
    problems.push("Add your country in Settings.");
  }
  if (!org.taxIdentifier) {
    problems.push("Add your tax number (Steuernummer) or VAT ID in Settings.");
  } else if (org.taxIdentifier.type === "us_ein") {
    problems.push("A German invoice needs a Steuernummer or VAT ID, not an EIN.");
  }
  if (!org.contactName?.trim() || !org.contactEmail?.trim()) {
    problems.push("Add a contact name and email for your business in Settings.");
  }
  return problems;
}

// § 14 Abs. 4 Nr. 1 UStG: full name and address of the buyer.
function buyerProblems(client: ComplianceClient) {
  const problems: Array<string> = [];
  if (!(client.company?.trim() || client.name.trim())) {
    problems.push("Add the client's name or company.");
  }
  if (!hasStructuredAddress(client)) {
    problems.push(
      client.address?.trim()
        ? "Split the client's address into street, postal code, city and country."
        : "Add the client's street, postal code, city and country.",
    );
  }
  if (!client.countryCode?.trim()) {
    problems.push("Add the client's country.");
  }
  return problems;
}

/**
 * `strict` is on for German workspaces at issuance and for every XRechnung
 * export. Other workspaces keep their legacy freedom apart from the conflict.
 */
function taxProblems({ client, invoice, org }: ComplianceInput, strict: boolean) {
  const problems: Array<string> = [];
  const conflict = taxTreatmentConflict(invoice.taxTreatment, invoice.taxRate);
  if (conflict) {
    problems.push(conflict);
  }
  if (!strict) {
    return problems;
  }
  // § 14 Abs. 4 Nr. 8 UStG: a 0% invoice must say why. BR-S-05: category S needs a rate above zero.
  if (invoice.taxTreatment === "standard" && Number(invoice.taxRate ?? 0) === 0) {
    problems.push(
      "The tax rate is 0% but the treatment is standard VAT. Pick zero-rated, small business exemption (§ 19 UStG) or reverse charge, or set a tax rate.",
    );
  }
  // § 13b UStG / Art. 196 VAT Directive: a business customer abroad owes the VAT.
  if (invoice.taxTreatment === "reverse_charge") {
    const clientCountry = client.countryCode?.toUpperCase() ?? "";
    const sellerCountry = org.countryCode?.toUpperCase() ?? "";
    if (clientCountry && clientCountry === sellerCountry) {
      problems.push(
        "Reverse charge applies to business customers in another country. Use standard VAT for domestic clients.",
      );
    }
    if (clientCountry && isViesCountry(clientCountry) && client.taxIdentifier?.type !== "eu_vat") {
      problems.push("Reverse charge in the EU needs the client's VAT ID.");
    }
  }
  return problems;
}

function periodProblems(invoice: ComplianceInvoice, required: boolean) {
  const { servicePeriodEnd: end, servicePeriodStart: start } = invoice;
  if (start && end) {
    return end < start ? ["The service period must end on or after it starts."] : [];
  }
  if (start || end) {
    return ["Give both the start and the end of the service period, or a single date."];
  }
  // § 14 Abs. 4 Nr. 6 UStG: date or period of supply.
  return required ? ["Add the service date or period."] : [];
}

/** Problems that stop an invoice from being issued (sent or marked sent). */
export function validateForIssuance(input: ComplianceInput): Array<string> {
  const { bankAccount, client, invoice, org } = input;
  const german = isGermanOrg(org);
  const problems = [
    ...taxProblems(input, german),
    ...(invoice.lineItemCount === 0 ? ["Add at least one line item."] : []),
    ...periodProblems(invoice, german && !invoice.issued),
    ...(german
      ? [...sellerProblems(org), ...buyerProblems(client), ...bankProblems(bankAccount, false)]
      : []),
  ];
  // Leitweg-ID for public-sector buyers (BT-10 is mandatory in XRechnung).
  if (client.publicSector && !invoice.buyerReference?.trim()) {
    problems.push("Public-sector clients need a buyer reference (Leitweg-ID).");
  }
  return problems;
}

/** Everything issuance needs plus what the XRechnung export additionally requires. */
export function validateForXRechnung(input: ComplianceInput): Array<string> {
  const { bankAccount, client, invoice, org } = input;
  // An issued document cannot be edited any more, so a missing period on a
  // legacy invoice is reported in the XML as no period rather than blocking it.
  const problems = new Set([
    ...validateForIssuance(input),
    ...taxProblems(input, true),
    ...sellerProblems(org),
    ...buyerProblems(client),
    ...periodProblems(invoice, !invoice.issued),
    ...bankProblems(bankAccount, true),
  ]);
  // BR-DE-6: the seller contact needs a phone number.
  if (!org.contactPhone?.trim()) {
    problems.add("Add a contact phone number for your business in Settings.");
  }
  return [...problems];
}
