import { expect, test } from "bun:test";

import { getApiKeyPrefix, hashApiKey } from "@/lib/api-auth";

test("API key helpers preserve a short prefix and stable hash", () => {
  const apiKey = "nota_abcdefghijklmnopqrstuvwxyz";

  expect(getApiKeyPrefix(apiKey)).toBe("nota_abc");
  expect(hashApiKey(apiKey)).toHaveLength(64);
  expect(hashApiKey(apiKey)).toBe(hashApiKey(apiKey));
  expect(hashApiKey(apiKey)).not.toBe(hashApiKey(`${apiKey}-different`));
});

const bearerRequest = (token: string) =>
  new Request("http://localhost:3000/api/v1/me", {
    headers: { authorization: `Bearer ${token}` },
  });

test("non-API-key bearer tokens go through OAuth verification and fail closed", async () => {
  const { authenticateApiRequest } = await import("@/lib/api-auth");

  expect(await authenticateApiRequest(bearerRequest("not-a-jwt"))).toBeNull();
  expect(await authenticateApiRequest(bearerRequest("eyJhbGciOiJub25lIn0.e30."))).toBeNull();
  expect(await authenticateApiRequest(new Request("http://localhost:3000/api/v1/me"))).toBeNull();
});
