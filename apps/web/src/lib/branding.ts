import { documentCountryLine, type AddressDocumentOptions } from "@/lib/postal-address";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export function formatOrgAddress(
  org: {
    businessAddress?: string | null;
    city?: string | null;
    country?: string | null;
    countryCode?: string | null;
    postalCode?: string | null;
    region?: string | null;
    street?: string | null;
  },
  options?: AddressDocumentOptions,
) {
  // Nothing structured: the free text people typed is the whole address, so a
  // country line on its own would replace it rather than complete it.
  if (!org.street && !org.postalCode && !org.city) {
    return org.businessAddress ?? null;
  }
  // On a document the country is named in its language and dropped at home;
  // without a stored code the free text people typed is printed as is.
  const country = !options
    ? org.country
    : org.countryCode
      ? documentCountryLine(org.countryCode, options)
      : options.omitCountry
        ? null
        : org.country;
  const structured = [
    org.street,
    [org.postalCode, org.city].filter(Boolean).join(" "),
    org.region,
    country,
  ].filter(Boolean) as Array<string>;
  return structured.length ? structured.join("\n") : (org.businessAddress ?? null);
}

export async function getPdfLogoSrc(logoUrl?: string | null) {
  if (!logoUrl) {
    return null;
  }

  try {
    const response = await fetch(logoUrl, { cache: "force-cache" });
    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
      return null;
    }

    const contentLength = Number.parseInt(response.headers.get("content-length") ?? "0", 10);
    if (contentLength > MAX_LOGO_BYTES) {
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_LOGO_BYTES) {
      return null;
    }

    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}
