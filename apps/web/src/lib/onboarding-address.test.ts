import { expect, test } from "bun:test";

import { addressChanges, addressNeedsReview, splitCityRegion } from "@/lib/onboarding-address";
import type { SiteProfile } from "@/lib/site-reader/types";

const usFields: SiteProfile["fields"] = {
  city: { confidence: 0.5, source: "search", value: "Redondo Beach" },
  country: { confidence: 0.5, source: "search", value: "United States" },
  countryCode: { confidence: 0.5, source: "search", value: "US" },
  postalCode: { confidence: 0.5, source: "search", value: "90277" },
  region: { confidence: 0.5, source: "search", value: "CA" },
};

test("offers a reviewed US city/state split without treating ordinary city names as states", () => {
  expect(splitCityRegion("Silverton CO", usFields)).toEqual({ city: "Silverton", region: "CO" });
  expect(splitCityRegion("Silverton, co", usFields)).toEqual({ city: "Silverton", region: "CO" });
  expect(splitCityRegion("Rio de Janeiro", usFields)).toBeNull();
  expect(
    splitCityRegion("Silverton CO", {
      ...usFields,
      country: { confidence: 1, source: "user", value: "Canada" },
      countryCode: { confidence: 1, source: "user", value: "CA" },
    }),
  ).toBeNull();
});

test("an address needs review only when a retained field is explicitly unconfirmed", () => {
  expect(addressNeedsReview(usFields)).toBe(false);
  expect(
    addressNeedsReview({
      ...usFields,
      postalCode: { ...usFields.postalCode!, confirmed: false },
    }),
  ).toBe(true);
});

test("country edits clear the old country code instead of retaining an inconsistent pair", () => {
  expect(addressChanges("country", "Canada", usFields).changes).toEqual({
    country: "Canada",
    countryCode: "",
  });
  expect(addressChanges("country", "United States", usFields).changes).toEqual({
    country: "United States",
  });
});
