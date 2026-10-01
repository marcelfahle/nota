import { expect, mock, test } from "bun:test";

import { getInsufficientPermissionsError } from "@/lib/roles";

let serviceResult: { error: string } | { invoiceId: string; success: true } = {
  invoiceId: "inv_1",
  success: true,
};
const updates: Array<unknown> = [];
mock.module("@/lib/api-response", () => ({
  error: (message: string, status = 400) => Response.json({ error: message }, { status }),
  json: (body: unknown) => Response.json(body),
  requireAuth: async () => ({
    auth: { org: { id: "org_1" }, role: "member", user: { id: "user_1" } },
  }),
}));
mock.module("@/lib/invoice-service", () => ({
  changeInvoiceDueDate: async (...args: Array<unknown>) => {
    updates.push(args);
    return serviceResult;
  },
  getInvoiceDetail: async () => ({ dueAt: "2026-10-08", id: "inv_1", total: "1000.00" }),
}));
const { PATCH } = await import("./route");
function update(body: string) {
  return PATCH(
    new Request("http://nota.test/api/v1/invoices/inv_1/due-date", { body, method: "PATCH" }),
    { params: Promise.resolve({ id: "inv_1" }) },
  );
}
test("due date API rejects invalid JSON and impossible dates before mutation", async () => {
  const count = updates.length;
  expect((await update("{")).status).toBe(400);
  expect((await update(JSON.stringify({ dueAt: "2026-02-30" }))).status).toBe(400);
  expect(updates.length).toBe(count);
});
test("due date API passes workspace and role to the shared service", async () => {
  serviceResult = { invoiceId: "inv_1", success: true };
  const response = await update(JSON.stringify({ dueAt: "2026-10-08" }));
  expect(response.status).toBe(200);
  expect(updates.at(-1)).toEqual([
    { orgId: "org_1", role: "member", userId: "user_1" },
    "inv_1",
    "2026-10-08",
  ]);
  expect((await response.json()).data.total).toBe("1000.00");
});
test("due date API distinguishes forbidden, missing, and concurrent changes", async () => {
  for (const [error, status] of [
    [getInsufficientPermissionsError(), 403],
    ["Invoice not found", 404],
    ["Invoice changed. Refresh and try again.", 409],
  ] as const) {
    serviceResult = { error };
    expect((await update(JSON.stringify({ dueAt: "2026-10-08" }))).status).toBe(status);
  }
});
