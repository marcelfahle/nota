const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export function formatOrgAddress(org: {
  businessAddress?: string | null;
  city?: string | null;
  country?: string | null;
  postalCode?: string | null;
  region?: string | null;
  street?: string | null;
}) {
  const structured = [
    org.street,
    [org.postalCode, org.city].filter(Boolean).join(" "),
    org.region,
    org.country,
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
