import { expect, test } from "bun:test";

import {
  clientPayloadSchema,
  normalizeClientPayload,
  taxIdentifierFromClientPayload,
} from "@/lib/api-clients";

const required = { email: "client@example.test", name: "Example Client" };

test("client API accepts a structured EIN and preserves its display value", () => {
  const payload = {
    ...required,
    taxIdentifier: { type: "us_ein", value: "12 3456789" },
  };
  const parsed = clientPayloadSchema.parse(normalizeClientPayload(payload));

  expect(taxIdentifierFromClientPayload(payload, parsed)).toEqual({
    canonicalValue: "123456789",
    countryCode: "US",
    type: "us_ein",
    value: "12-3456789",
  });
});

test("client API rejects unknown identifier types", () => {
  const payload = {
    ...required,
    taxIdentifier: { type: "irs_verified", value: "12-3456789" },
  };

  expect(clientPayloadSchema.safeParse(normalizeClientPayload(payload)).success).toBe(false);
});

test("legacy vatNumber input remains compatible without guessing a non-EU type", () => {
  const euPayload = { ...required, vatNumber: "DE 123 456 789" };
  const eu = clientPayloadSchema.parse(normalizeClientPayload(euPayload));
  expect(taxIdentifierFromClientPayload(euPayload, eu)).toMatchObject({
    canonicalValue: "DE123456789",
    type: "eu_vat",
  });

  const ambiguousPayload = { ...required, vatNumber: "12-3456789" };
  const ambiguous = clientPayloadSchema.parse(normalizeClientPayload(ambiguousPayload));
  expect(taxIdentifierFromClientPayload(ambiguousPayload, ambiguous)).toMatchObject({
    type: "tax_id",
    value: "12-3456789",
  });
});
