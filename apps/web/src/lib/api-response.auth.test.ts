import { expect, mock, test } from "bun:test";

const actualApiAuth = await import("./api-auth");

mock.module("@/lib/api-auth", () => ({
  ...actualApiAuth,
  authenticateApiRequest: async () => null,
}));

const { requireAuth } = await import("./api-response");

test("requireAuth returns a 401 response when the bearer token is missing or invalid", async () => {
  const result = await requireAuth(new Request("http://nota.test/api/v1/me"));

  expect("error" in result).toBe(true);
  if (!("error" in result)) {
    throw new Error("Expected an auth error response");
  }

  expect(result.error.status).toBe(401);
  await expect(result.error.json()).resolves.toEqual({ error: "Unauthorized" });
});
