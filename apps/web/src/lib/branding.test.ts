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
});
