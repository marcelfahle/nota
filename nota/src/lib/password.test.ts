import { describe, expect, test } from "bun:test";

import { hashPassword, verifyPassword } from "@/lib/password";

describe("password", () => {
  test("hashes and verifies a password", async () => {
    const hash = await hashPassword("correct horse battery staple");

    expect(hash).toContain(":");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });
});
