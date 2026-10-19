import { describe, expect, test } from "bun:test";

import { NextRequest } from "next/server";

process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret-test-secret";

const { proxy } = await import("./proxy");

function request(method: string, path: string, cookie: string) {
  return new NextRequest(new URL(path, "http://localhost:3000"), {
    headers: { cookie },
    method,
  });
}

const session = "better-auth.session_token=session-token";
const viewAs = "nota_view_as=payload.signature";

describe("proxy while viewing as support", () => {
  test("refuses a mutating server action or API call", async () => {
    for (const path of ["/invoices/new", "/api/chat", "/settings"]) {
      const response = proxy(request("POST", path, `${session}; ${viewAs}`));
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "Read-only while viewing as support." });
    }
  });

  test("still serves pages and lets the admin leave", () => {
    expect(proxy(request("GET", "/invoices", `${session}; ${viewAs}`)).status).toBe(200);
    expect(proxy(request("POST", "/admin/view-as/exit", `${session}; ${viewAs}`)).status).toBe(200);
  });

  test("does not touch a session without the view-as cookie", () => {
    expect(proxy(request("POST", "/invoices/new", session)).status).toBe(200);
  });

  test("drops a stale grant once the admin has signed out", () => {
    const response = proxy(request("GET", "/login", viewAs));
    expect(response.status).toBe(200);
    expect(response.cookies.get("nota_view_as")?.value).toBe("");
  });
});
