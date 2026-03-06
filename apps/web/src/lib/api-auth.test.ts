import { expect, test } from "bun:test";

import { getApiKeyPrefix, hashApiKey } from "@/lib/api-auth";

test("API key helpers preserve a short prefix and stable hash", () => {
  const apiKey = "nota_abcdefghijklmnopqrstuvwxyz";

  expect(getApiKeyPrefix(apiKey)).toBe("nota_abc");
  expect(hashApiKey(apiKey)).toHaveLength(64);
  expect(hashApiKey(apiKey)).toBe(hashApiKey(apiKey));
  expect(hashApiKey(apiKey)).not.toBe(hashApiKey(`${apiKey}-different`));
});
