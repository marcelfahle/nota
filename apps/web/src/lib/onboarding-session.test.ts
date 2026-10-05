import { expect, test } from "bun:test";

import {
  applyProfileEdits,
  applyVatOutcome,
  cookieValueFromHeader,
  orgValuesFromProfile,
  splitRegistryAddress,
  verifyCookieValue,
} from "@/lib/onboarding-session";
import type { SiteProfile } from "@/lib/site-reader/types";

const profile: SiteProfile = {
  brandColor: "#43C6A6",
  colors: [{ hex: "#43C6A6", text: "#1F1B16" }],
  domain: "boldvideo.com",
  favicon: null,
  fields: {
    city: {
      confidence: 0.5,
      confirmed: false,
      detail: "Crunchbase",
      source: "search",
      value: "Dénia",
    },
    country: {
      confidence: 0.5,
      confirmed: false,
      detail: "Crunchbase",
      source: "search",
      value: "Spain",
    },
    email: {
      confidence: 0.7,
      detail: "your website",
      source: "site",
      value: "support@boldvideo.com",
    },
    name: {
      confidence: 0.8,
      detail: "your site's structured data",
      source: "site",
      value: "Bold Video",
    },
    summary: { confidence: 0.7, source: "site", value: "You build a video platform." },
  },
  logo: null,
  website: "https://boldvideo.com/",
};

test("a cookie with a wrong or missing signature is not a session", () => {
  expect(verifyCookieValue("token.bad-signature")).toBeNull();
  expect(verifyCookieValue("no-signature")).toBeNull();
  expect(verifyCookieValue(null)).toBeNull();
  expect(cookieValueFromHeader("a=1; nota_onboarding=abc.def; b=2")).toBe("abc.def");
  expect(cookieValueFromHeader("a=1")).toBeNull();
});

test("the visitor's edits become theirs; unknown fields are ignored", () => {
  const next = applyProfileEdits(profile, {
    brandColor: "#14705a",
    confirm: { city: profile.fields.city, nonsense: profile.fields.city },
    fields: { email: "", name: "  Bold  ", orgId: "x", street: 42 },
  });
  expect(next.fields.name).toEqual({
    confidence: 1,
    confirmed: true,
    source: "user",
    value: "Bold",
  });
  expect(next.fields.email).toBeUndefined();
  expect(next.fields.city?.confirmed).toBe(true);
  expect(next.fields.country?.confirmed).toBe(false);
  expect(next.brandColor).toBe("#14705A");
  expect(Object.keys(next.fields)).not.toContain("orgId");
  // The original is untouched.
  expect(profile.fields.name?.value).toBe("Bold Video");
});

test("a city correction makes retained address details reviewable instead of silently confirming them", () => {
  const stale: SiteProfile = {
    ...profile,
    fields: {
      ...profile.fields,
      city: { confidence: 0.5, confirmed: true, source: "search", value: "Redondo Beach" },
      country: {
        confidence: 0.5,
        confirmed: true,
        source: "search",
        value: "United States",
      },
      countryCode: { confidence: 0.5, confirmed: true, source: "search", value: "US" },
      postalCode: { confidence: 0.5, confirmed: true, source: "search", value: "90277" },
      region: { confidence: 0.5, confirmed: true, source: "search", value: "CA" },
    },
  };
  const next = applyProfileEdits(stale, {
    fields: { city: "Silverton" },
    review: ["city", "region", "postalCode", "country", "countryCode"],
  });

  expect(next.fields.city).toMatchObject({
    confirmed: false,
    source: "user",
    value: "Silverton",
  });
  expect(next.fields.region).toMatchObject({ confirmed: false, value: "CA" });
  expect(next.fields.postalCode).toMatchObject({
    confirmed: false,
    reviewRequired: true,
    value: "90277",
  });
  expect(next.fields.country).toMatchObject({
    confirmed: false,
    reviewRequired: true,
    value: "United States",
  });
});

test("confirmation persists exact reviewed values while provenance remains server-owned", () => {
  const lateReaderProfile: SiteProfile = {
    ...profile,
    fields: {
      ...profile.fields,
      city: { confidence: 0.5, source: "search", value: "Silverton" },
      postalCode: { confidence: 0.5, source: "search", value: "90277" },
      region: { confidence: 0.5, source: "search", value: "CA" },
    },
  };
  const next = applyProfileEdits(lateReaderProfile, {
    confirm: {
      city: { confidence: 1, source: "user", value: "Silverton" },
      postalCode: { confidence: 1, source: "user", value: "81433" },
      region: { confidence: 1, source: "user", value: "CO" },
    },
  });

  expect(next.fields.city).toEqual({
    confidence: 0.5,
    confirmed: true,
    source: "search",
    value: "Silverton",
  });
  expect(next.fields.region).toMatchObject({ confirmed: true, source: "user", value: "CO" });
  expect(next.fields.postalCode).toMatchObject({
    confirmed: true,
    source: "user",
    value: "81433",
  });
});

test("confirmation cannot forge registry provenance", () => {
  const next = applyProfileEdits(profile, {
    confirm: {
      legalName: {
        confidence: 1,
        confirmed: true,
        detail: "the EU VAT registry",
        source: "registry",
        value: "Forged Registry Name",
      },
    },
  });
  expect(next.fields.legalName).toEqual({
    confidence: 1,
    confirmed: true,
    source: "user",
    value: "Forged Registry Name",
  });
});

test("clearing a country and its code cannot resurrect extracted values", () => {
  const withCountry: SiteProfile = {
    ...profile,
    fields: {
      ...profile.fields,
      countryCode: { confidence: 0.5, source: "search", value: "US" },
    },
  };
  const next = applyProfileEdits(withCountry, {
    fields: { country: "", countryCode: "" },
    review: ["country", "countryCode"],
  });
  expect(next.fields.country).toBeUndefined();
  expect(next.fields.countryCode).toBeUndefined();
});

test("registry addresses split into street, postcode and city", () => {
  expect(splitRegistryAddress("\nOOSTERDOKSKADE 00163\n1011DL AMSTERDAM\n")).toEqual({
    city: "AMSTERDAM",
    postalCode: "1011DL",
    street: "OOSTERDOKSKADE 00163",
  });
  expect(splitRegistryAddress("11 RUE AMPERE\n26600 PONT DE L ISERE")).toEqual({
    city: "PONT DE L ISERE",
    postalCode: "26600",
    street: "11 RUE AMPERE",
  });
  expect(splitRegistryAddress("3RD FLOOR, GORDON HOUSE, BARROW STREET, DUBLIN 4")).toEqual({
    street: "3RD FLOOR, GORDON HOUSE, BARROW STREET, DUBLIN 4",
  });
});

test("a valid VAT ID with details fills legal name and address from the registry", () => {
  const next = applyVatOutcome(profile, "NL805734958B01", {
    address: "\nOOSTERDOKSKADE 00163\n1011DL AMSTERDAM\n",
    name: "BOOKING.COM B.V.",
    status: "valid",
  });
  expect(next.fields.legalName).toMatchObject({ source: "registry", value: "BOOKING.COM B.V." });
  expect(next.fields.street?.value).toBe("OOSTERDOKSKADE 00163");
  expect(next.fields.city).toMatchObject({ source: "registry", value: "AMSTERDAM" });
  expect(next.fields.vatNumber).toMatchObject({ source: "user", value: "NL805734958B01" });
});

test("a late registry answer preserves address values the visitor typed or reviewed", () => {
  const reviewed: SiteProfile = {
    ...profile,
    fields: {
      ...profile.fields,
      city: { confidence: 1, confirmed: true, source: "user", value: "Silverton" },
      postalCode: { confidence: 1, confirmed: true, source: "user", value: "81433" },
      street: { confidence: 0.8, confirmed: true, source: "site", value: "10 Greene St" },
    },
  };
  const next = applyVatOutcome(reviewed, "NL805734958B01", {
    address: "OOSTERDOKSKADE 00163\n1011DL AMSTERDAM",
    name: "BOOKING.COM B.V.",
    status: "valid",
  });
  expect(next.fields.street).toMatchObject({ source: "site", value: "10 Greene St" });
  expect(next.fields.city).toMatchObject({ source: "user", value: "Silverton" });
  expect(next.fields.postalCode).toMatchObject({ source: "user", value: "81433" });
});

test("a registry answer cannot replace retained fields awaiting grouped review", () => {
  const awaitingReview: SiteProfile = {
    ...profile,
    fields: {
      ...profile.fields,
      city: {
        confidence: 0.5,
        confirmed: false,
        reviewRequired: true,
        source: "search",
        value: "Silverton",
      },
      postalCode: {
        confidence: 0.5,
        confirmed: false,
        reviewRequired: true,
        source: "search",
        value: "90277",
      },
    },
  };
  const next = applyVatOutcome(awaitingReview, "NL805734958B01", {
    address: "OOSTERDOKSKADE 00163\n1011DL AMSTERDAM",
    name: null,
    status: "valid",
  });
  expect(next.fields.city?.value).toBe("Silverton");
  expect(next.fields.postalCode?.value).toBe("90277");
});

test("a valid VAT ID without details, an invalid one and a registry outage change nothing else", () => {
  for (const status of ["valid", "invalid", "unavailable"] as const) {
    const next = applyVatOutcome(profile, "ESA28015865", { address: null, name: null, status });
    expect(next.vat?.status).toBe(status);
    expect(next.fields.legalName).toBeUndefined();
    expect(next.fields.city?.value).toBe("Dénia");
  }
});

test("org values carry each field's source; search results stay unconfirmed", () => {
  const now = new Date("2026-10-04T12:00:00Z");
  const values = orgValuesFromProfile(
    applyVatOutcome(profile, "ESA28015865", { address: null, name: null, status: "valid" }),
    now,
  );
  expect(values).toMatchObject({
    brandColor: "#43C6A6",
    city: "Dénia",
    contactEmail: "support@boldvideo.com",
    country: "Spain",
    name: "Bold Video",
    vatNumber: "ESA28015865",
    vatStatus: "valid",
    website: "https://boldvideo.com/",
  });
  expect(values.profileSources?.city).toEqual({
    at: now.toISOString(),
    confirmed: false,
    detail: "Crunchbase",
    source: "search",
  });
  expect(values.profileSources?.name?.confirmed).toBe(true);
  expect(values.profileSources?.vatNumber?.source).toBe("user");
  // The summary is for the onboarding screen only; it is not an org column.
  expect(values).not.toHaveProperty("summary");
});
