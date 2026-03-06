import { createHmac, timingSafeEqual } from "node:crypto";

import { getAuthEnv } from "@/lib/env";

const PASSWORD_RESET_TTL_MS = 1000 * 60 * 60;

function signResetPayload(userId: string, expiresAt: number, passwordHash: string) {
  return createHmac("sha256", getAuthEnv().SESSION_SECRET)
    .update(`${userId}.${expiresAt}.${passwordHash}`)
    .digest("hex");
}

export function createPasswordResetToken(userId: string, passwordHash: string, now = Date.now()) {
  const expiresAt = now + PASSWORD_RESET_TTL_MS;
  const signature = signResetPayload(userId, expiresAt, passwordHash);
  return `${userId}.${expiresAt}.${signature}`;
}

export function verifyPasswordResetToken(token: string, passwordHash: string, now = Date.now()) {
  const [userId, expiresAtValue, signature] = token.split(".");
  const expiresAt = Number.parseInt(expiresAtValue ?? "", 10);

  if (!userId || !signature || Number.isNaN(expiresAt) || expiresAt < now) {
    return null;
  }

  const expectedSignature = signResetPayload(userId, expiresAt, passwordHash);
  const expectedBuffer = Buffer.from(expectedSignature, "hex");
  const actualBuffer = Buffer.from(signature, "hex");

  if (expectedBuffer.length !== actualBuffer.length) {
    return null;
  }

  if (!timingSafeEqual(expectedBuffer, actualBuffer)) {
    return null;
  }

  return { expiresAt, userId };
}

export const passwordResetTtlMs = PASSWORD_RESET_TTL_MS;
