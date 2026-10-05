export type ProfileSource = "registry" | "search" | "site" | "user";

export const PROFILE_FIELDS = [
  "name",
  "legalName",
  "summary",
  "email",
  "street",
  "postalCode",
  "city",
  "region",
  "country",
  "countryCode",
  "vatNumber",
] as const;

export type ProfileFieldKey = (typeof PROFILE_FIELDS)[number];

export type ProfileField = {
  /** 0..1. Search results stay unconfirmed whatever the confidence. */
  confidence: number;
  confirmed?: boolean;
  /** Where exactly: "your footer", "Impressum", "Crunchbase". */
  detail?: string;
  /** A retained address value conflicts with an edit and must be reviewed as part of the group. */
  reviewRequired?: boolean;
  source: ProfileSource;
  value: string;
};

export type BrandColorCandidate = {
  hex: string;
  /** Text colour that stays readable on top of `hex`. */
  text: string;
};

export type VatOutcome = {
  address: string | null;
  name: string | null;
  status: "invalid" | "unavailable" | "valid";
};

export type SiteProfile = {
  brandColor: string | null;
  colors: Array<BrandColorCandidate>;
  /** Fetch-only read: the model and outside search were skipped. */
  degraded?: boolean;
  domain: string;
  /** PNG data URLs, re-encoded by us. Never the site's original bytes. */
  favicon: string | null;
  fields: Partial<Record<ProfileFieldKey, ProfileField>>;
  logo: string | null;
  vat?: VatOutcome;
  website: string;
};

export type ReaderStep = "colors" | "legal" | "location" | "site";

export type ReaderEvent =
  | { domain: string; type: "start"; website: string }
  | { field: ProfileField; key: ProfileFieldKey; type: "field" }
  | { colors: Array<BrandColorCandidate>; type: "colors" }
  | { favicon: string | null; logo: string | null; type: "logo" }
  | { state: "active" | "done" | "skipped"; step: ReaderStep; type: "step" }
  | { profile: SiteProfile; type: "done" }
  | { code: "busy" | "invalid" | "unreachable"; message: string; type: "error" };

export function emptyProfile(website: string, domain: string): SiteProfile {
  return { brandColor: null, colors: [], domain, favicon: null, fields: {}, logo: null, website };
}

/** "boldvideo.com" → "Boldvideo": the fallback name when a site tells us nothing. */
export function nameFromDomain(domain: string) {
  const label = domain.split(".").at(-2) ?? domain;
  return label
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}
