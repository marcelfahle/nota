import { describe, expect, test } from "bun:test";

import {
  createPasswordResetToken,
  passwordResetTtlMs,
  verifyPasswordResetToken,
} from "@/lib/password-reset";

describe("password reset tokens", () => {
  test("verifies a valid token", () => {
    process.env.SESSION_SECRET = "x".repeat(32);
    const passwordHash = "salt:hash";
    const now = 1_700_000_000_000;
    const token = createPasswordResetToken("user-1", passwordHash, now);

    expect(verifyPasswordResetToken(token, passwordHash, now + 1000)).toEqual({
      expiresAt: now + passwordResetTtlMs,
      userId: "user-1",
    });
  });

  test("rejects expired tokens", () => {
    process.env.SESSION_SECRET = "x".repeat(32);
    const token = createPasswordResetToken("user-1", "salt:hash", 1_700_000_000_000);

    expect(
      verifyPasswordResetToken(token, "salt:hash", 1_700_000_000_000 + passwordResetTtlMs + 1),
    ).toBeNull();
  });

  test("rejects tokens after password changes", () => {
    process.env.SESSION_SECRET = "x".repeat(32);
    const token = createPasswordResetToken("user-1", "salt:old-hash", 1_700_000_000_000);

    expect(verifyPasswordResetToken(token, "salt:new-hash", 1_700_000_001_000)).toBeNull();
  });
});
