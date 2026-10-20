import { beforeEach, describe, expect, mock, test } from "bun:test";

process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret-test-secret";

const adminId = "11111111-1111-4111-8111-111111111111";
const orgId = "22222222-2222-4222-8222-222222222222";
const ownerId = "33333333-3333-4333-8333-333333333333";
let sessionUser: Record<string, unknown> | null = null;
let cookieValue: string | undefined;
const contextCalls: Array<[string, string | undefined]> = [];
const ownerContext = { id: ownerId, org: { id: orgId }, user: { id: ownerId } };

const headersModule = await import("next/headers");
mock.module("next/headers", () => ({
  ...headersModule,
  cookies: async () => ({ get: () => (cookieValue ? { value: cookieValue } : undefined) }),
  headers: async () => new Headers(),
}));
mock.module("@/lib/better-auth", () => ({
  auth: {
    api: {
      getSession: async () =>
        sessionUser ? { session: { id: "session-1" }, user: { id: sessionUser.id } } : null,
    },
  },
}));
mock.module("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => (sessionUser ? [sessionUser] : []) }) }),
    }),
  },
}));
mock.module("@/lib/user-context", () => ({
  getUserContextById: async (userId: string, scopedOrgId?: string) => {
    contextCalls.push([userId, scopedOrgId]);
    return ownerContext;
  },
}));

const { getCurrentUserOrNull, getViewAs } = await import("./auth");
const { signViewAs } = await import("./admin-view-as");

const exp = Math.floor(Date.now() / 1000) + 600;
const admin = { id: adminId, isSuperAdmin: true, mustChangePassword: false };

beforeEach(() => {
  contextCalls.length = 0;
  sessionUser = admin;
  cookieValue = signViewAs({ adminUserId: adminId, exp, orgId, userId: ownerId });
});

describe("getViewAs", () => {
  test("honours a grant the signed-in super admin started", async () => {
    expect(await getViewAs()).toEqual({ adminUserId: adminId, exp, orgId, userId: ownerId });
  });

  test("ignores a grant started by a different admin", async () => {
    cookieValue = signViewAs({ adminUserId: "other-admin", exp, orgId, userId: ownerId });
    expect(await getViewAs()).toBeNull();
  });

  test("ignores a grant while the admin still has a temporary password", async () => {
    sessionUser = { ...admin, mustChangePassword: true };
    expect(await getViewAs()).toBeNull();
  });

  test("ignores a grant for an ordinary user, an expired grant, and no cookie", async () => {
    sessionUser = { id: adminId, isSuperAdmin: false, mustChangePassword: false };
    expect(await getViewAs()).toBeNull();
    sessionUser = admin;
    cookieValue = signViewAs({ adminUserId: adminId, exp: exp - 1200, orgId, userId: ownerId });
    expect(await getViewAs()).toBeNull();
    cookieValue = undefined;
    expect(await getViewAs()).toBeNull();
  });
});

describe("getCurrentUserOrNull while viewing as", () => {
  test("resolves the super admin to the owner inside the viewed workspace only", async () => {
    expect(await getCurrentUserOrNull()).toBe(ownerContext);
    expect(contextCalls).toEqual([[ownerId, orgId]]);
  });

  test("keeps a super admin without a grant out of the workspace app", async () => {
    cookieValue = undefined;
    expect(await getCurrentUserOrNull()).toBeNull();
    expect(contextCalls).toEqual([]);
  });

  test("leaves ordinary users untouched by a stray cookie", async () => {
    sessionUser = { id: "user-1", isSuperAdmin: false, mustChangePassword: false };
    expect(await getCurrentUserOrNull()).toBe(ownerContext);
    expect(contextCalls).toEqual([["user-1", undefined]]);
  });
});
