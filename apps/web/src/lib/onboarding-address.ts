import type { ProfileField, ProfileFieldKey } from "@/lib/site-reader/types";

export const ADDRESS_FIELDS = ["city", "region", "postalCode", "country", "countryCode"] as const;

export type AddressFieldKey = (typeof ADDRESS_FIELDS)[number];

const US_STATE_CODES = new Set(
  "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(
    " ",
  ),
);

export function addressNeedsReview(
  fields: Partial<Record<ProfileFieldKey, ProfileField>>,
): boolean {
  return ADDRESS_FIELDS.some((key) => fields[key]?.confirmed === false);
}

export function addressChanges(
  key: AddressFieldKey,
  value: string,
  fields: Partial<Record<ProfileFieldKey, ProfileField>>,
) {
  const trimmed = value.trim();
  const split = key === "city" ? splitCityRegion(trimmed, fields) : null;
  const changes: Partial<Record<AddressFieldKey, string>> = split
    ? { city: split.city, region: split.region }
    : { [key]: trimmed };
  if (key === "country" && trimmed !== fields.country?.value) {
    changes.countryCode = "";
  }
  return { changes, split: Boolean(split) };
}

/** A US city chip may contain "Silverton CO" or "Silverton, CO". */
export function splitCityRegion(
  value: string,
  fields: Partial<Record<ProfileFieldKey, ProfileField>>,
) {
  const country = fields.country?.value.trim().toLowerCase();
  const countryCode = fields.countryCode?.value.trim().toUpperCase();
  const isUnitedStates =
    countryCode === "US" ||
    country === "united states" ||
    country === "united states of america" ||
    country === "usa";
  if (!isUnitedStates) {
    return null;
  }
  const match = value.trim().match(/^(.+?)(?:,\s*|\s+)([A-Za-z]{2})$/);
  const region = match?.[2].toUpperCase();
  return match && region && US_STATE_CODES.has(region) ? { city: match[1].trim(), region } : null;
}
