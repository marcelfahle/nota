import { expect, mock, test } from "bun:test";

import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const dialect = new PgDialect();
const saved: Array<Record<string, unknown>> = [
  { email: "already@client.test", name: "Existing", orgId: "org_a" },
  { email: "new@client.test", name: "Other workspace", orgId: "org_b" },
];
const locks: Array<string> = [];
let failInsert = false;
const database = {
  execute: async (statement: SQL) => {
    locks.push(dialect.sqlToQuery(statement).sql);
  },
  insert: () => ({
    values: async (rows: Array<Record<string, unknown>>) => {
      saved.push(...rows);
      if (failInsert) {
        throw new Error("Simulated insert failure");
      }
    },
  }),
  select: () => ({
    from: () => ({
      where: async (statement: SQL) => {
        const org = dialect.sqlToQuery(statement).params[0];
        return saved.filter((row) => row.orgId === org);
      },
    }),
  }),
  transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
    const before = saved.slice();
    try {
      return await callback(database);
    } catch (error) {
      saved.splice(0, saved.length, ...before);
      throw error;
    }
  },
};
mock.module("@/lib/db", () => ({ db: database }));
mock.module("next/cache", () => ({ revalidatePath: () => {} }));
const { handleClientImport } = await import("./client-import-http");
const auth = { org: { defaultCurrency: "GBP", id: "org_a" }, user: { id: "user_a" } };
const csv =
  "Organization,Email\nNew Client,new@client.test\nAlready Here,already@client.test\nMissing Email,";
function request(body: unknown, contentType = "application/json") {
  return handleClientImport(
    new Request("https://nota.test/api/clients/import", {
      body: JSON.stringify(body),
      headers: { "Content-Type": contentType },
      method: "POST",
    }),
    auth,
  );
}

test("CSV HTTP workflow previews without writing, imports only approved rows into the workspace, and detects retries", async () => {
  const before = saved.length;
  const response = await request({ csv, mode: "preview" });
  expect(response.status).toBe(200);
  const { data } = await response.json();
  expect(data.counts).toEqual({ duplicate: 1, invalid: 1, ready: 1, total: 3 });
  expect(saved.length).toBe(before);
  const commit = await request({ csv, mode: "commit", previewHash: data.hash });
  expect(commit.status).toBe(200);
  expect((await commit.json()).data.added).toBe(1);
  expect(saved.at(-1)).toMatchObject({
    defaultCurrency: "GBP",
    email: "new@client.test",
    name: "New Client",
    orgId: "org_a",
    userId: "user_a",
  });
  expect(saved[0].name).toBe("Existing");
  expect(locks[0]).toContain("pg_advisory_xact_lock");
  const retry = await request({ csv, mode: "commit", previewHash: data.hash });
  expect(retry.status).toBe(409);
  expect((await retry.json()).data.counts.ready).toBe(0);
  expect(saved.length).toBe(before + 1);
});

test("changed previews cannot write, failed imports roll back, and invalid requests do not import", async () => {
  const fresh = "Name,Email\nAda,ada@client.test";
  const { data } = await (await request({ csv: fresh, mode: "preview" })).json();
  const before = saved.length;
  expect(
    (await request({ csv: fresh.replace("Ada", "Other"), mode: "commit", previewHash: data.hash }))
      .status,
  ).toBe(409);
  failInsert = true;
  expect((await request({ csv: fresh, mode: "commit", previewHash: data.hash })).status).toBe(500);
  failInsert = false;
  expect(saved.length).toBe(before);
  expect((await request({ csv: fresh, mode: "commit" })).status).toBe(400);
  expect((await request({ csv: "Invoice Number,Total\n97,100", mode: "preview" })).status).toBe(
    400,
  );
  expect((await request({ csv: fresh, mode: "preview" }, "text/plain")).status).toBe(415);
  expect((await request({ csv: "a".repeat(2 * 1024 * 1024), mode: "preview" })).status).toBe(413);
  expect(saved.length).toBe(before);
});

const authModule = await import("@/lib/auth");
const responseModule = await import("@/lib/api-response");
let signedIn = false;
mock.module("@/lib/auth", () => ({
  ...authModule,
  getActiveUserOrNull: async () => (signedIn ? auth : null),
}));
mock.module("@/lib/api-response", () => ({
  ...responseModule,
  requireAuth: async (request: Request) =>
    request.headers.get("authorization") === "Bearer nota_fixture"
      ? { auth }
      : { error: Response.json({ error: "Unauthorized" }, { status: 401 }) },
}));
const { POST: browserPost } = await import("../app/api/clients/import/route");
const { POST: apiPost } = await import("../app/api/v1/clients/import/route");

test("browser and API import routes enforce authentication, browser Origin, and authenticated workspace scope", async () => {
  const body = JSON.stringify({
    csv: "Name,Email\nAda,ada@new.test",
    mode: "preview",
    orgId: "org_b",
  });
  const make = (headers: Record<string, string> = {}) =>
    new Request("https://nota.test/api/clients/import", {
      body,
      headers: { "Content-Type": "application/json", ...headers },
      method: "POST",
    });
  signedIn = false;
  expect((await browserPost(make({ origin: "https://nota.test" }))).status).toBe(401);
  expect((await apiPost(make())).status).toBe(401);
  signedIn = true;
  expect((await browserPost(make({ origin: "https://evil.test" }))).status).toBe(403);
  expect((await browserPost(make())).status).toBe(403);
  expect((await browserPost(make({ origin: "https://nota.test" }))).status).toBe(200);
  const response = await apiPost(make({ authorization: "Bearer nota_fixture" }));
  expect(response.status).toBe(200);
  expect((await response.json()).data.rows[0].client.defaultCurrency).toBe("GBP");
});
