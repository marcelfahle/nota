import { paymentIban } from "@/lib/iban";
import { absoluteDecimal, formatStoredMoney, formatVariableDecimal } from "@/lib/money";
import type { TaxIdentifier } from "@/lib/tax-identifier";
import { taxCategory, type TaxTreatment } from "@/lib/tax-treatment";

export type XRechnungAddress = {
  city?: string | null;
  /** ISO 3166-1 alpha-2. Required: XRechnung has no default country. */
  countryCode?: string | null;
  postalCode?: string | null;
  street?: string | null;
};

export type XRechnungData = {
  business: XRechnungAddress & {
    bankDetails?: string | null;
    bic?: string | null;
    /** BR-DE-2: seller contact with name, phone and email (BR-DE-5 to 7). */
    contact?: { email?: string | null; name?: string | null; phone?: string | null } | null;
    email: string;
    iban?: string | null;
    name?: string | null;
    taxIdentifier?: TaxIdentifier | null;
  };
  client: XRechnungAddress & {
    company?: string | null;
    email: string;
    name: string;
    /** A public-sector buyer must carry its Leitweg-ID as the buyer reference. */
    publicSector?: boolean | null;
    taxIdentifier?: TaxIdentifier | null;
  };
  invoice: {
    /** BT-10. Falls back to the invoice number for non-public-sector buyers. */
    buyerReference?: string | null;
    currency: string;
    dueAt: string;
    issuedAt: string;
    kind?: "credit_note" | "invoice";
    lineItems: Array<{
      amount: string;
      description: string;
      quantity: string;
      unitPrice: string;
    }>;
    notes?: string | null;
    number: string;
    originalNumber?: string | null;
    paymentLinkUrl?: string | null;
    servicePeriodEnd?: string | null;
    servicePeriodStart?: string | null;
    subtotal: string;
    taxAmount: string;
    taxRate: string;
    taxTreatment: TaxTreatment;
    total: string;
  };
};

export class XRechnungValidationError extends Error {
  readonly problems: Array<string>;

  constructor(problems: Array<string> | string) {
    const list = Array.isArray(problems) ? problems : [problems];
    super(list.join(" "));
    this.name = "XRechnungValidationError";
    this.problems = list;
  }
}

// ---------------------------------------------------------------------------
// Country name → ISO 3166-1 alpha-2 (legacy free-text addresses only)
// ---------------------------------------------------------------------------
const COUNTRY_CODES: Record<string, string> = {
  austria: "AT",
  belgium: "BE",
  bulgaria: "BG",
  croatia: "HR",
  cyprus: "CY",
  czechia: "CZ",
  denmark: "DK",
  deutschland: "DE",
  españa: "ES",
  estonia: "EE",
  finland: "FI",
  france: "FR",
  germany: "DE",
  greece: "GR",
  hungary: "HU",
  ireland: "IE",
  italy: "IT",
  latvia: "LV",
  lithuania: "LT",
  luxembourg: "LU",
  malta: "MT",
  netherlands: "NL",
  norway: "NO",
  österreich: "AT",
  poland: "PL",
  portugal: "PT",
  romania: "RO",
  schweiz: "CH",
  slovakia: "SK",
  slovenia: "SI",
  spain: "ES",
  sweden: "SE",
  switzerland: "CH",
  "united kingdom": "GB",
  "united states": "US",
};

/** Best effort for legacy free text. Returns null when the name is unknown. */
export function toCountryCode(country: string): string | null {
  const trimmed = country.trim();
  if (/^[A-Za-z]{2}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  return COUNTRY_CODES[trimmed.toLowerCase()] ?? null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** Escapes markup and drops the control characters XML 1.0 does not allow at all. */
export function escapeXml(value: string): string {
  return (
    value
      // eslint-disable-next-line no-control-regex
      .replaceAll(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;")
  );
}

function fmt(value: string): string {
  return formatVariableDecimal(value, 6, 2);
}

/** Splits a legacy free-text address. Structured columns should be preferred. */
export function parseAddress(address?: string | null): XRechnungAddress {
  const empty = { city: null, countryCode: null, postalCode: null, street: null };
  if (!address) {
    return empty;
  }

  const lines = address
    .split(/\n|,\s*/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return empty;
  }

  if (lines.length === 1) {
    return { ...empty, street: lines[0] };
  }

  const street = lines[0];
  const rawCountry = lines.length >= 3 ? (lines.at(-1) ?? "") : "";
  const countryCode = rawCountry ? toCountryCode(rawCountry) : null;
  const cityLine = lines.length >= 3 ? (lines.at(-2) ?? "") : lines[1];

  const postalMatch = cityLine.match(/^(\d{4,6})\s+(.+)$/);
  if (postalMatch) {
    return { city: postalMatch[2], countryCode, postalCode: postalMatch[1], street };
  }

  const postalMatch2 = cityLine.match(/^(.+?)\s+(\d{4,6})$/);
  if (postalMatch2) {
    return { city: postalMatch2[1], countryCode, postalCode: postalMatch2[2], street };
  }

  return { city: cityLine, countryCode, postalCode: null, street };
}

function buildPartyAddress(address: XRechnungAddress, countryCode: string): string {
  return `<cac:PostalAddress>
${address.street ? `<cbc:StreetName>${escapeXml(address.street)}</cbc:StreetName>` : ""}
${address.city ? `<cbc:CityName>${escapeXml(address.city)}</cbc:CityName>` : ""}
${address.postalCode ? `<cbc:PostalZone>${escapeXml(address.postalCode)}</cbc:PostalZone>` : ""}
<cac:Country>
<cbc:IdentificationCode>${escapeXml(countryCode)}</cbc:IdentificationCode>
</cac:Country>
</cac:PostalAddress>`;
}

/**
 * BT-31 (VAT ID, scheme VAT) or BT-32 (tax registration such as a German
 * Steuernummer, scheme FC). BR-CO-26 needs at least one for the seller.
 */
function buildPartyTaxScheme(identifier: TaxIdentifier | null | undefined): string {
  if (!identifier || identifier.type === "us_ein") {
    return "";
  }
  const scheme = identifier.type === "eu_vat" ? "VAT" : "FC";
  return `<cac:PartyTaxScheme>
<cbc:CompanyID>${escapeXml(identifier.type === "eu_vat" ? identifier.canonicalValue : identifier.value)}</cbc:CompanyID>
<cac:TaxScheme>
<cbc:ID>${scheme}</cbc:ID>
</cac:TaxScheme>
</cac:PartyTaxScheme>`;
}

/**
 * BR-CO-26: the seller needs BT-29, BT-30 or BT-31 so the buyer can identify
 * it. A VAT ID is BT-31; a Steuernummer only fills BT-32, so it is repeated as
 * the seller identifier (BT-29), the one official identifier such a seller has.
 */
function buildSellerIdentification(identifier: TaxIdentifier | null | undefined): string {
  if (identifier?.type !== "tax_id") {
    return "";
  }
  return `<cac:PartyIdentification>
<cbc:ID>${escapeXml(identifier.value)}</cbc:ID>
</cac:PartyIdentification>`;
}

function buildTaxCategoryXml(tax: ReturnType<typeof taxCategory>): string {
  return `<cac:TaxCategory>
<cbc:ID>${tax.code}</cbc:ID>
<cbc:Percent>${fmt(tax.rate)}</cbc:Percent>
${tax.exemptionReasonCode ? `<cbc:TaxExemptionReasonCode>${tax.exemptionReasonCode}</cbc:TaxExemptionReasonCode>` : ""}
${tax.exemptionReason ? `<cbc:TaxExemptionReason>${escapeXml(tax.exemptionReason)}</cbc:TaxExemptionReason>` : ""}
<cac:TaxScheme>
<cbc:ID>VAT</cbc:ID>
</cac:TaxScheme>
</cac:TaxCategory>`;
}

function requireData(data: XRechnungData) {
  const { business, client, invoice } = data;
  const problems: Array<string> = [];
  if (business.taxIdentifier?.type === "us_ein") {
    problems.push(
      "XRechnung requires supported EU legal tax data; an EIN or generic tax ID cannot be exported as VAT.",
    );
  }
  if (!business.countryCode?.trim()) {
    problems.push("The seller address needs a country code.");
  }
  if (!client.countryCode?.trim()) {
    problems.push("The buyer address needs a country code.");
  }
  if (!business.contact?.name?.trim() || !business.contact.email?.trim()) {
    problems.push("The seller contact needs a name and an email address (BR-DE-2).");
  }
  if (client.publicSector && !invoice.buyerReference?.trim()) {
    problems.push("Public-sector buyers need their Leitweg-ID as the buyer reference (BT-10).");
  }
  if (
    (invoice.servicePeriodStart && !invoice.servicePeriodEnd) ||
    (!invoice.servicePeriodStart && invoice.servicePeriodEnd)
  ) {
    problems.push("The service period needs both a start and an end date.");
  }
  if (problems.length) {
    throw new XRechnungValidationError(problems);
  }
}

// ---------------------------------------------------------------------------
// Generate XRechnung UBL XML
// ---------------------------------------------------------------------------
export function generateXRechnung(data: XRechnungData): string {
  requireData(data);
  const { business, client, invoice } = data;
  const cur = escapeXml(invoice.currency);
  const tax = taxCategory(invoice.taxTreatment, invoice.taxRate);
  const buyerName = escapeXml(client.company || client.name);
  const iban = paymentIban({ details: business.bankDetails, iban: business.iban });
  const bic = business.bic || null;
  const isCreditNote = invoice.kind === "credit_note";
  const documentName = isCreditNote ? "CreditNote" : "Invoice";
  const lineName = isCreditNote ? "CreditNoteLine" : "InvoiceLine";
  const quantityName = isCreditNote ? "CreditedQuantity" : "InvoicedQuantity";
  const amount = (value: string) =>
    formatStoredMoney(isCreditNote ? absoluteDecimal(value, 4) : value, invoice.currency);
  const quantity = (value: string) => formatVariableDecimal(value, 6, 2);
  const unitPrice = (value: string) =>
    formatVariableDecimal(isCreditNote ? absoluteDecimal(value, 6) : value, 6, 2);
  // BT-10 is mandatory (BR-DE-15). Without an agreed reference the invoice
  // number is the only honest value for a private buyer.
  const buyerReference = invoice.buyerReference?.trim() || invoice.number;
  const contact = business.contact!;

  const lines = invoice.lineItems
    .map(
      (item, i) => `<cac:${lineName}>
<cbc:ID>${i + 1}</cbc:ID>
<cbc:${quantityName} unitCode="C62">${escapeXml(quantity(item.quantity))}</cbc:${quantityName}>
<cbc:LineExtensionAmount currencyID="${cur}">${escapeXml(amount(item.amount))}</cbc:LineExtensionAmount>
<cac:Item>
<cbc:Name>${escapeXml(item.description)}</cbc:Name>
<cac:ClassifiedTaxCategory>
<cbc:ID>${tax.code}</cbc:ID>
<cbc:Percent>${escapeXml(fmt(tax.rate))}</cbc:Percent>
<cac:TaxScheme>
<cbc:ID>VAT</cbc:ID>
</cac:TaxScheme>
</cac:ClassifiedTaxCategory>
</cac:Item>
<cac:Price>
<cbc:PriceAmount currencyID="${cur}">${escapeXml(unitPrice(item.unitPrice))}</cbc:PriceAmount>
</cac:Price>
</cac:${lineName}>`,
    )
    .join("\n");

  // PaymentMeans: SEPA credit transfer (58) with IBAN if available
  let paymentMeans = `<cac:PaymentMeans>
<cbc:PaymentMeansCode>58</cbc:PaymentMeansCode>
<cbc:PaymentID>${escapeXml(invoice.number)}</cbc:PaymentID>`;
  if (iban) {
    paymentMeans += `
<cac:PayeeFinancialAccount>
<cbc:ID>${escapeXml(iban)}</cbc:ID>`;
    if (bic) {
      paymentMeans += `
<cac:FinancialInstitutionBranch>
<cbc:ID>${escapeXml(bic)}</cbc:ID>
</cac:FinancialInstitutionBranch>`;
    }
    paymentMeans += `
</cac:PayeeFinancialAccount>`;
  }
  paymentMeans += `
</cac:PaymentMeans>`;

  const invoicePeriod =
    invoice.servicePeriodStart && invoice.servicePeriodEnd
      ? `<cac:InvoicePeriod>
<cbc:StartDate>${escapeXml(invoice.servicePeriodStart)}</cbc:StartDate>
<cbc:EndDate>${escapeXml(invoice.servicePeriodEnd)}</cbc:EndDate>
</cac:InvoicePeriod>`
      : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<${documentName} xmlns="urn:oasis:names:specification:ubl:schema:xsd:${documentName}-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
<cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0</cbc:CustomizationID>
<cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
<cbc:ID>${escapeXml(invoice.number)}</cbc:ID>
<cbc:IssueDate>${escapeXml(invoice.issuedAt)}</cbc:IssueDate>
${isCreditNote ? "" : `<cbc:DueDate>${escapeXml(invoice.dueAt)}</cbc:DueDate>`}
<cbc:${isCreditNote ? "CreditNoteTypeCode" : "InvoiceTypeCode"}>${isCreditNote ? "381" : "380"}</cbc:${isCreditNote ? "CreditNoteTypeCode" : "InvoiceTypeCode"}>
${invoice.notes ? `<cbc:Note>${escapeXml(invoice.notes)}</cbc:Note>` : ""}
<cbc:DocumentCurrencyCode>${cur}</cbc:DocumentCurrencyCode>
<cbc:BuyerReference>${escapeXml(buyerReference)}</cbc:BuyerReference>
${invoicePeriod}
${isCreditNote && invoice.originalNumber ? `<cac:BillingReference>\n<cac:InvoiceDocumentReference>\n<cbc:ID>${escapeXml(invoice.originalNumber)}</cbc:ID>\n</cac:InvoiceDocumentReference>\n</cac:BillingReference>` : ""}
<cac:AccountingSupplierParty>
<cac:Party>
<cbc:EndpointID schemeID="EM">${escapeXml(business.email)}</cbc:EndpointID>
${buildSellerIdentification(business.taxIdentifier)}
${business.name ? `<cac:PartyName>\n<cbc:Name>${escapeXml(business.name)}</cbc:Name>\n</cac:PartyName>` : ""}
${buildPartyAddress(business, business.countryCode!)}
${buildPartyTaxScheme(business.taxIdentifier)}
<cac:PartyLegalEntity>
<cbc:RegistrationName>${escapeXml(business.name || business.email)}</cbc:RegistrationName>
</cac:PartyLegalEntity>
<cac:Contact>
<cbc:Name>${escapeXml(contact.name!)}</cbc:Name>
${contact.phone ? `<cbc:Telephone>${escapeXml(contact.phone)}</cbc:Telephone>` : ""}
<cbc:ElectronicMail>${escapeXml(contact.email!)}</cbc:ElectronicMail>
</cac:Contact>
</cac:Party>
</cac:AccountingSupplierParty>
<cac:AccountingCustomerParty>
<cac:Party>
<cbc:EndpointID schemeID="EM">${escapeXml(client.email)}</cbc:EndpointID>
<cac:PartyName>
<cbc:Name>${buyerName}</cbc:Name>
</cac:PartyName>
${buildPartyAddress(client, client.countryCode!)}
${client.taxIdentifier?.type === "eu_vat" ? buildPartyTaxScheme(client.taxIdentifier) : ""}
<cac:PartyLegalEntity>
<cbc:RegistrationName>${buyerName}</cbc:RegistrationName>
</cac:PartyLegalEntity>
<cac:Contact>
<cbc:ElectronicMail>${escapeXml(client.email)}</cbc:ElectronicMail>
</cac:Contact>
</cac:Party>
</cac:AccountingCustomerParty>
${paymentMeans}
<cac:TaxTotal>
<cbc:TaxAmount currencyID="${cur}">${amount(invoice.taxAmount)}</cbc:TaxAmount>
<cac:TaxSubtotal>
<cbc:TaxableAmount currencyID="${cur}">${amount(invoice.subtotal)}</cbc:TaxableAmount>
<cbc:TaxAmount currencyID="${cur}">${amount(invoice.taxAmount)}</cbc:TaxAmount>
${buildTaxCategoryXml(tax)}
</cac:TaxSubtotal>
</cac:TaxTotal>
<cac:LegalMonetaryTotal>
<cbc:LineExtensionAmount currencyID="${cur}">${amount(invoice.subtotal)}</cbc:LineExtensionAmount>
<cbc:TaxExclusiveAmount currencyID="${cur}">${amount(invoice.subtotal)}</cbc:TaxExclusiveAmount>
<cbc:TaxInclusiveAmount currencyID="${cur}">${amount(invoice.total)}</cbc:TaxInclusiveAmount>
<cbc:PayableAmount currencyID="${cur}">${amount(invoice.total)}</cbc:PayableAmount>
</cac:LegalMonetaryTotal>
${lines}
</${documentName}>`;
}
