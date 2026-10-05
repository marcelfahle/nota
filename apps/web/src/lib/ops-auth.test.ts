import { expect, test } from "bun:test";

import { hasBearerSecret } from "./ops-auth";

const request = (authorization?: string) =>
  new Request("http://localhost/api/doctor", {
    headers: authorization ? { authorization } : undefined,
  });

test("operator bearer authentication requires an exact secret", () => {
  expect(hasBearerSecret(request("Bearer correct"), "correct")).toBe(true);
  expect(hasBearerSecret(request("Bearer incorrect"), "correct")).toBe(false);
  expect(hasBearerSecret(request("Basic correct"), "correct")).toBe(false);
  expect(hasBearerSecret(request(), "correct")).toBe(false);
});
