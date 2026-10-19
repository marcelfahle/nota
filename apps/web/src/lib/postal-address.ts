import { parseAddress, toCountryCode, type XRechnungAddress } from "@/lib/xrechnung";

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
): string | null {
  if (!hasStructured(client)) {
    return client.address ?? null;
  }
  const lines = [
    client.street,
    [client.postalCode, client.city].filter(Boolean).join(" "),
    client.countryCode,
  ].filter(Boolean) as Array<string>;
  return lines.length ? lines.join("\n") : null;
}
