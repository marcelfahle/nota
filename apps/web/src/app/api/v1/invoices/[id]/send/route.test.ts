import { expect, mock, test } from "bun:test";

import { getInsufficientPermissionsError } from "@/lib/roles";

mock.module("@/lib/api-response", () => ({
  error: (message: string, status = 400) => Response.json({ error: message }, { status }),
  json: (body: unknown, status = 200) => Response.json(body, { status }),
  requireAuth: async () => ({
    auth: {
      apiKey: { id: "key_1" },
      org: { id: "org_1" },
      role: "member",
      user: { id: "user_1" },
    },
  }),
}));

mock.module("@/lib/api-invoice-actions", () => ({
  sendInvoiceFromApi: async () => ({
    error: getInsufficientPermissionsError(),
    status: 403,
  }),
}));

const { POST } = await import("./route");

test("send invoice API route returns 403 for members", async () => {
  const response = await POST(
    new Request("http://nota.test/api/v1/invoices/inv_1/send", { method: "POST" }),
    { params: Promise.resolve({ id: "inv_1" }) },
  );

  expect(response.status).toBe(403);
  await expect(response.json()).resolves.toEqual({ error: "Insufficient permissions" });
});
