import { mock } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Unit tests never reach a real database or mail server; modules only need
// well-formed config to load. Keeps tests independent of file order and mocks.
process.env.APP_URL ??= "http://localhost:3000";
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/nota_test";
process.env.SESSION_SECRET ??= "test-session-secret-at-least-32-characters";
// Stored files go to a throwaway directory, so storage tests run for real and
// no test needs to replace the storage module (module mocks are global in bun).
process.env.STORAGE ??= "local";
process.env.LOCAL_STORAGE_PATH ??= mkdtempSync(join(tmpdir(), "nota-test-storage-"));

// Never send unit-test traffic to a developer's real PostHog project.
process.env.NEXT_PUBLIC_POSTHOG_KEY = "";
process.env.NEXT_PUBLIC_POSTHOG_HOST = "";

// Constructing Better Auth seeds OAuth resources in the database. Unit tests
// get a signed-out stub; the real flow is covered end to end.
mock.module("@/lib/better-auth", () => ({
  auth: { api: { getSession: async () => null } },
}));
