import { beforeEach, describe, expect, mock, test } from "bun:test";

process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret-test-secret";

const admin = { id: "11111111-1111-4111-8111-111111111111", isSuperAdmin: true };
const orgId = "22222222-2222-4222-8222-222222222222";
const ownerId = "33333333-3333-4333-8333-333333333333";
const inserts: Array<Record<string, unknown>> = [];
let sessionUser: Record<string, unknown> | null = admin;
let cookieValue: string | undefined;
let failInsertsWithTargets = false;

const headersModule = await import("next/headers");
mock.module("next/headers", () => ({
  ...headersModule,
  cookies: async () => ({ get: () => (cookieValue ? { value: cookieValue } : undefined) }),
}));
const authModule = await import("@/lib/auth");
mock.module("@/lib/auth", () => ({
  ...authModule,
  getCurrentSessionUser: async () => sessionUser,
}));
mock.module("@/lib/db", () => ({
  db: {
    insert: () => ({
      values: async (values: Record<string, unknown>) => {
        if (failInsertsWithTargets && values.targetOrgId) {
          throw new Error("foreign key violation");
        }
        inserts.push(values);
        return [];
      },
    }),
  },
}));

const { POST } = await import("./route");
const { signViewAs, VIEW_AS_COOKIE } = await import("@/lib/admin-view-as");

const exp = Math.floor(Date.now() / 1000) + 600;
const request = () => new Request("http://localhost:3013/admin/view-as/exit", { method: "POST" });

beforeEach(() => {
  inserts.length = 0;
  sessionUser = admin;
  cookieValue = signViewAs({ adminUserId: admin.id, exp, orgId, userId: ownerId });
  failInsertsWithTargets = false;
});

describe("POST /admin/view-as/exit", () => {
  test("records the exit, clears the grant and returns to the workspace", async () => {
    const response = await POST(request());
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      `http://localhost:3013/admin/workspaces/${orgId}`,
    );
    expect(response.cookies.get(VIEW_AS_COOKIE)?.value).toBe("");
    expect(inserts).toEqual([
      expect.objectContaining({
        action: "view-as.exited",
        adminUserId: admin.id,
        targetOrgId: orgId,
        targetUserId: ownerId,
      }),
    ]);
  });

  test("still exits when the viewed workspace was deleted meanwhile", async () => {
    failInsertsWithTargets = true;
    const response = await POST(request());
    expect(response.status).toBe(303);
    expect(response.cookies.get(VIEW_AS_COOKIE)?.value).toBe("");
    expect(inserts).toEqual([
      expect.objectContaining({
        action: "view-as.exited",
        metadata: { orgId, userId: ownerId },
        targetOrgId: null,
        targetUserId: null,
      }),
    ]);
  });

  test("ignores a grant issued to a different admin but still clears it", async () => {
    cookieValue = signViewAs({ adminUserId: "someone-else", exp, orgId, userId: ownerId });
    const response = await POST(request());
    expect(response.status).toBe(303);
    expect(response.cookies.get(VIEW_AS_COOKIE)?.value).toBe("");
    expect(inserts).toEqual([]);
  });

  test("is not found for anyone but a super admin", async () => {
    sessionUser = { id: "user-1", isSuperAdmin: false };
    expect((await POST(request())).status).toBe(404);
    sessionUser = null;
    expect((await POST(request())).status).toBe(404);
    expect(inserts).toEqual([]);
  });
});
