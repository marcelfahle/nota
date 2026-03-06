type XRechnungData = {
  business: {
    address?: string | null;
    email: string;
    name?: string | null;
    vatNumber?: string | null;
  };
  client: {
    address?: string | null;
    company?: string | null;
    email: string;
    name: string;
    vatNumber?: string | null;
  };
  invoice: {
    currency: string;
    dueAt: string;
    issuedAt: string;
    lineItems: Array<{
      amount: string;
      description: string;
      quantity: string;
      unitPrice: string;
    }>;
    notes?: string | null;
    number: string;
    reverseCharge?: string | null;
    subtotal: string;
    taxAmount: string;
    taxRate: string;
    total: string;
  };
};

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function fmt(value: string): string {
  return Number(value).toFixed(2);
}

function parseAddress(address?: string | null): {
  city: string;
  country: string;
  postal: string;
  street: string;
} {
  if (!address) {
    return { city: "", country: "", postal: "", street: "" };
  }

  const lines = address
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { city: "", country: "", postal: "", street: "" };
  }

  if (lines.length === 1) {
    return { city: "", country: "", postal: "", street: lines[0] };
  }

  const street = lines[0];
  const country = lines.length >= 3 ? (lines.at(-1) ?? "") : "";
  const cityLine = lines.length >= 3 ? (lines.at(-2) ?? "") : lines[1];

  const postalMatch = cityLine.match(/^(\d{4,6})\s+(.+)$/);
  if (postalMatch) {
    return { city: postalMatch[2], country, postal: postalMatch[1], street };
  }

  const postalMatch2 = cityLine.match(/^(.+?)\s+(\d{4,6})$/);
  if (postalMatch2) {
    return { city: postalMatch2[1], country, postal: postalMatch2[2], street };
  }

  return {
    city: cityLine,
    country: lines.length >= 3 ? (lines.at(-1) ?? "") : "",
    postal: "",
    street,
  };
}

function buildPartyAddress(address?: string | null): string {
  const { city, country, postal, street } = parseAddress(address);
  return `<cac:PostalAddress>
${street ? `<cbc:StreetName>${escapeXml(street)}</cbc:StreetName>` : ""}
${city ? `<cbc:CityName>${escapeXml(city)}</cbc:CityName>` : ""}
${postal ? `<cbc:PostalZone>${escapeXml(postal)}</cbc:PostalZone>` : ""}
<cac:Country>
<cbc:IdentificationCode>${country ? escapeXml(country) : "DE"}</cbc:IdentificationCode>
</cac:Country>
</cac:PostalAddress>`;
}

function buildTaxCategory(
  reverseCharge: string | null | undefined,
  taxRate: string,
): { code: string; exemption: string; rate: string } {
  if (reverseCharge === "true") {
    return {
      code: "AE",
      exemption: `<cbc:TaxExemptionReasonCode>vatex-eu-ae</cbc:TaxExemptionReasonCode>
<cbc:TaxExemptionReason>Reverse charge</cbc:TaxExemptionReason>`,
      rate: "0",
    };
  }
  if (taxRate === "0" || taxRate === "0.00") {
    return { code: "Z", exemption: "", rate: "0" };
  }
  return { code: "S", exemption: "", rate: taxRate };
}

export function generateXRechnung(data: XRechnungData): string {
  const { business, client, invoice } = data;
  const cur = escapeXml(invoice.currency);
  const tax = buildTaxCategory(invoice.reverseCharge, invoice.taxRate);
  const buyerName = escapeXml(client.company || client.name);

  const lines = invoice.lineItems
    .map(
      (item, i) => `<cac:InvoiceLine>
<cbc:ID>${i + 1}</cbc:ID>
<cbc:InvoicedQuantity unitCode="C62">${escapeXml(fmt(item.quantity))}</cbc:InvoicedQuantity>
<cbc:LineExtensionAmount currencyID="${cur}">${escapeXml(fmt(item.amount))}</cbc:LineExtensionAmount>
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
<cbc:PriceAmount currencyID="${cur}">${escapeXml(fmt(item.unitPrice))}</cbc:PriceAmount>
</cac:Price>
</cac:InvoiceLine>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
<cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0</cbc:CustomizationID>
<cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
<cbc:ID>${escapeXml(invoice.number)}</cbc:ID>
<cbc:IssueDate>${escapeXml(invoice.issuedAt)}</cbc:IssueDate>
<cbc:DueDate>${escapeXml(invoice.dueAt)}</cbc:DueDate>
<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
${invoice.notes ? `<cbc:Note>${escapeXml(invoice.notes)}</cbc:Note>` : ""}
<cbc:DocumentCurrencyCode>${cur}</cbc:DocumentCurrencyCode>
<cbc:BuyerReference>${escapeXml(invoice.number)}</cbc:BuyerReference>
<cac:AccountingSupplierParty>
<cac:Party>
<cbc:EndpointID schemeID="EM">${escapeXml(business.email)}</cbc:EndpointID>
${business.name ? `<cac:PartyName>\n<cbc:Name>${escapeXml(business.name)}</cbc:Name>\n</cac:PartyName>` : ""}
${buildPartyAddress(business.address)}
${business.vatNumber ? `<cac:PartyTaxScheme>\n<cbc:CompanyID>${escapeXml(business.vatNumber)}</cbc:CompanyID>\n<cac:TaxScheme>\n<cbc:ID>VAT</cbc:ID>\n</cac:TaxScheme>\n</cac:PartyTaxScheme>` : ""}
<cac:PartyLegalEntity>
<cbc:RegistrationName>${escapeXml(business.name || business.email)}</cbc:RegistrationName>
</cac:PartyLegalEntity>
<cac:Contact>
<cbc:ElectronicMail>${escapeXml(business.email)}</cbc:ElectronicMail>
</cac:Contact>
</cac:Party>
</cac:AccountingSupplierParty>
<cac:AccountingCustomerParty>
<cac:Party>
<cbc:EndpointID schemeID="EM">${escapeXml(client.email)}</cbc:EndpointID>
<cac:PartyName>
<cbc:Name>${buyerName}</cbc:Name>
</cac:PartyName>
${buildPartyAddress(client.address)}
${client.vatNumber ? `<cac:PartyTaxScheme>\n<cbc:CompanyID>${escapeXml(client.vatNumber)}</cbc:CompanyID>\n<cac:TaxScheme>\n<cbc:ID>VAT</cbc:ID>\n</cac:TaxScheme>\n</cac:PartyTaxScheme>` : ""}
<cac:PartyLegalEntity>
<cbc:RegistrationName>${buyerName}</cbc:RegistrationName>
</cac:PartyLegalEntity>
<cac:Contact>
<cbc:ElectronicMail>${escapeXml(client.email)}</cbc:ElectronicMail>
</cac:Contact>
</cac:Party>
</cac:AccountingCustomerParty>
<cac:PaymentMeans>
<cbc:PaymentMeansCode>58</cbc:PaymentMeansCode>
</cac:PaymentMeans>
<cac:TaxTotal>
<cbc:TaxAmount currencyID="${cur}">${fmt(invoice.taxAmount)}</cbc:TaxAmount>
<cac:TaxSubtotal>
<cbc:TaxableAmount currencyID="${cur}">${fmt(invoice.subtotal)}</cbc:TaxableAmount>
<cbc:TaxAmount currencyID="${cur}">${fmt(invoice.taxAmount)}</cbc:TaxAmount>
<cac:TaxCategory>
<cbc:ID>${tax.code}</cbc:ID>
<cbc:Percent>${fmt(tax.rate)}</cbc:Percent>
${tax.exemption}
<cac:TaxScheme>
<cbc:ID>VAT</cbc:ID>
</cac:TaxScheme>
</cac:TaxCategory>
</cac:TaxSubtotal>
</cac:TaxTotal>
<cac:LegalMonetaryTotal>
<cbc:LineExtensionAmount currencyID="${cur}">${fmt(invoice.subtotal)}</cbc:LineExtensionAmount>
<cbc:TaxExclusiveAmount currencyID="${cur}">${fmt(invoice.subtotal)}</cbc:TaxExclusiveAmount>
<cbc:TaxInclusiveAmount currencyID="${cur}">${fmt(invoice.total)}</cbc:TaxInclusiveAmount>
<cbc:PayableAmount currencyID="${cur}">${fmt(invoice.total)}</cbc:PayableAmount>
</cac:LegalMonetaryTotal>
${lines}
</Invoice>`;
}
