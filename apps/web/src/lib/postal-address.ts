import { countryName, type AppLocale } from "@/lib/i18n";
import { parseAddress, toCountryCode, type XRechnungAddress } from "@/lib/xrechnung";

/**
 * How a document prints the country line: named in the document language,
 * and left out on a domestic invoice, where both parties are in one country.
 */
export type AddressDocumentOptions = {
  locale: AppLocale;
  omitCountry?: boolean;
};

export function documentCountryLine(
  code: string | null | undefined,
  options: AddressDocumentOptions | undefined,
) {
  if (!options) {
    return code ?? null;
  }
  return options.omitCountry ? null : countryName(code, options.locale);
}

/** Both parties in one country: the country line says nothing and is left out. */
export function isDomestic(
  seller: { countryCode?: string | null },
  client: { countryCode?: string | null },
) {
  const home = seller.countryCode?.trim().toUpperCase();
  return Boolean(home) && home === client.countryCode?.trim().toUpperCase();
}

type StructuredColumns = {
  city?: string | null;
  countryCode?: string | null;
  postalCode?: string | null;
  street?: string | null;
};

function hasStructured(columns: StructuredColumns) {
  return Boolean(columns.street || columns.postalCode || columns.city);
}

/** Structured org address, reading the legacy free text only when nothing structured exists. */
export function orgPostalAddress(
  org: StructuredColumns & { businessAddress?: string | null; country?: string | null },
): XRechnungAddress {
  if (hasStructured(org)) {
    return {
      city: org.city ?? null,
      countryCode: org.countryCode ?? (org.country ? toCountryCode(org.country) : null),
      postalCode: org.postalCode ?? null,
      street: org.street ?? null,
    };
  }
  return { ...parseAddress(org.businessAddress), countryCode: org.countryCode ?? null };
}

/** Structured client address, reading the legacy free text only when nothing structured exists. */
export function clientPostalAddress(
  client: StructuredColumns & { address?: string | null },
): XRechnungAddress {
  if (hasStructured(client)) {
    return {
      city: client.city ?? null,
      countryCode: client.countryCode ?? null,
      postalCode: client.postalCode ?? null,
      street: client.street ?? null,
    };
  }
  const parsed = parseAddress(client.address);
  return { ...parsed, countryCode: client.countryCode ?? parsed.countryCode };
}

/** Lines for the PDF and the public page: structured fields win over free text. */
export function formatClientAddress(
  client: StructuredColumns & { address?: string | null },
  options?: AddressDocumentOptions,
): string | null {
  if (!hasStructured(client)) {
    return client.address ?? null;
  }
  const lines = [
    client.street,
    [client.postalCode, client.city].filter(Boolean).join(" "),
    documentCountryLine(client.countryCode, options),
  ].filter(Boolean) as Array<string>;
  return lines.length ? lines.join("\n") : null;
}
