import { expect, mock, test } from "bun:test";

const disconnected: Array<[string, string]> = [];
let identity: { oauthClientId?: string; user: { id: string } } | null = null;
mock.module("@/lib/api-response", () => ({
  error: (message: string, status = 400) => Response.json({ error: message }, { status }),
  json: (body: unknown) => Response.json(body),
  requireAuth: async () =>
    identity
      ? { auth: identity }
      : { error: Response.json({ error: "Unauthorized" }, { status: 401 }) },
}));
mock.module("@/lib/connected-apps", () => ({
  disconnectApp: async (userId: string, clientId: string) => {
    disconnected.push([userId, clientId]);
  },
  listConnectedApps: async () => [],
}));
const { DELETE } = await import("./route");

test("logout rejects anonymous and API-key requests without revoking anything", async () => {
  identity = null;
  expect(
    (await DELETE(new Request("http://nota.test/api/v1/auth/session", { method: "DELETE" })))
      .status,
  ).toBe(401);
  identity = { user: { id: "current-user" } };
  expect(
    (await DELETE(new Request("http://nota.test/api/v1/auth/session", { method: "DELETE" })))
      .status,
  ).toBe(400);
  expect(disconnected).toHaveLength(0);
});

test("logout derives the user and client from authentication, ignoring supplied target IDs", async () => {
  identity = { oauthClientId: "current-client", user: { id: "current-user" } };
  const response = await DELETE(
    new Request("http://nota.test/api/v1/auth/session?clientId=victim", {
      body: JSON.stringify({ clientId: "victim", userId: "another-user" }),
      method: "DELETE",
    }),
  );
  expect(response.status).toBe(200);
  expect(disconnected).toEqual([["current-user", "current-client"]]);
});
