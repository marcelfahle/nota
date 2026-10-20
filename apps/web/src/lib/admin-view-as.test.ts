import { describe, expect, test } from "bun:test";

process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret-test-secret";

const { refusesWhileViewingAs, signViewAs, verifyViewAs } = await import("./admin-view-as");

const now = new Date("2026-10-19T10:00:00Z");
const claims = {
  adminUserId: "admin-1",
  exp: Math.floor(now.getTime() / 1000) + 30 * 60,
  orgId: "org-1",
  userId: "owner-1",
};

describe("view-as cookie", () => {
  test("round-trips signed claims", () => {
    expect(verifyViewAs(signViewAs(claims), now)).toEqual(claims);
  });

  test("rejects a tampered payload", () => {
    const [, signature] = signViewAs(claims).split(".");
    const forged = Buffer.from(JSON.stringify({ ...claims, orgId: "org-2" })).toString("base64url");
    expect(verifyViewAs(`${forged}.${signature}`, now)).toBeNull();
  });

  test("rejects a wrong signature, junk and nothing", () => {
    const [payload] = signViewAs(claims).split(".");
    expect(verifyViewAs(`${payload}.nope`, now)).toBeNull();
    expect(verifyViewAs("junk", now)).toBeNull();
    expect(verifyViewAs(undefined, now)).toBeNull();
  });

  test("expires after its half hour", () => {
    const value = signViewAs(claims);
    expect(verifyViewAs(value, new Date(now.getTime() + 29 * 60_000))).not.toBeNull();
    expect(verifyViewAs(value, new Date(now.getTime() + 31 * 60_000))).toBeNull();
  });
});

describe("refusesWhileViewingAs", () => {
  test("refuses every write, including admin actions and other auth calls", () => {
    expect(refusesWhileViewingAs("POST", "/invoices")).toBe(true);
    expect(refusesWhileViewingAs("POST", "/api/chat")).toBe(true);
    expect(refusesWhileViewingAs("DELETE", "/api/connected-apps")).toBe(true);
    expect(refusesWhileViewingAs("patch", "/settings")).toBe(true);
    expect(refusesWhileViewingAs("POST", "/admin/workspaces/some-id")).toBe(true);
    expect(refusesWhileViewingAs("POST", "/admin/view-as/exit/extra")).toBe(true);
    expect(refusesWhileViewingAs("POST", "/api/auth/sign-in/email")).toBe(true);
  });

  test("lets reads, leaving view-as and signing out through", () => {
    expect(refusesWhileViewingAs("GET", "/invoices")).toBe(false);
    expect(refusesWhileViewingAs("HEAD", "/api/chat")).toBe(false);
    expect(refusesWhileViewingAs("POST", "/admin/view-as/exit")).toBe(false);
    expect(refusesWhileViewingAs("POST", "/api/auth/sign-out")).toBe(false);
  });
});
