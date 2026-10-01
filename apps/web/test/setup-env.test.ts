import { mock } from "bun:test";

// Unit tests never reach a real database or mail server; modules only need
// well-formed config to load. Keeps tests independent of file order and mocks.
process.env.APP_URL ??= "http://localhost:3000";
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/nota_test";
process.env.SESSION_SECRET ??= "test-session-secret-at-least-32-characters";

// Constructing Better Auth seeds OAuth resources in the database. Unit tests
// get a signed-out stub; the real flow is covered end to end.
mock.module("@/lib/better-auth", () => ({
  auth: { api: { getSession: async () => null } },
}));
