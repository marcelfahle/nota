import { expect, test } from "bun:test";

import { formatOrgAddress } from "@/lib/branding";

test("structured org addresses omit missing fields and fall back to the legacy address", () => {
  expect(formatOrgAddress({ businessAddress: "Legacy", city: "Madrid" })).toBe("Madrid");
  expect(formatOrgAddress({ businessAddress: "Legacy" })).toBe("Legacy");
  expect(
    formatOrgAddress({
      city: "Berlin",
      country: "DE",
      postalCode: "10115",
      street: "Musterstraße 1",
    }),
  ).toBe("Musterstraße 1\n10115 Berlin\nDE");
  expect(
    formatOrgAddress({
      city: "Silverton",
      country: "United States",
      postalCode: "81433",
      region: "CO",
    }),
  ).toBe("81433 Silverton\nCO\nUnited States");
});

test("a document prints the country in its language, drops it at home and keeps free text whole", () => {
  const berlin = {
    city: "Berlin",
    countryCode: "DE",
    postalCode: "10115",
    street: "Musterstraße 1",
  };
  expect(formatOrgAddress(berlin, { locale: "de" })).toBe(
    "Musterstraße 1\n10115 Berlin\nDeutschland",
  );
  expect(formatOrgAddress(berlin, { locale: "en", omitCountry: true })).toBe(
    "Musterstraße 1\n10115 Berlin",
  );
  expect(
    formatOrgAddress(
      { businessAddress: "Altstraße 9, 80331 München", countryCode: "DE" },
      { locale: "en" },
    ),
  ).toBe("Altstraße 9, 80331 München");
});
