import { beforeEach, describe, expect, mock, test } from "bun:test";

process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret-test-secret";

const inserts: Array<{ table: unknown; values: Record<string, unknown> }> = [];
const cookieJar: Array<{ name: string; options: Record<string, unknown>; value: string }> = [];
let selectRows: Array<Record<string, unknown>> = [];
const admin = { email: "operator@nota.test", id: "11111111-1111-4111-8111-111111111111" };
const orgId = "22222222-2222-4222-8222-222222222222";
const ownerId = "33333333-3333-4333-8333-333333333333";

/** Just enough of Drizzle's query builder for the admin actions to run. */
function selectChain() {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    limit: () => chain,
    orderBy: () => chain,
    then: (resolve: (rows: unknown) => unknown, reject?: (error: unknown) => unknown) =>
      Promise.resolve(selectRows).then(resolve, reject),
    where: () => chain,
  };
  return chain;
}
const executor = {
  delete: () => ({ where: async () => [] }),
  insert: (table: unknown) => ({
    values: (values: Record<string, unknown>) => {
      inserts.push({ table, values });
      return Object.assign(Promise.resolve([]), { onConflictDoUpdate: async () => [] });
    },
  }),
  select: () => selectChain(),
  update: () => ({
    set: () => ({ where: () => ({ returning: async () => [{ name: "Acme Studio" }] }) }),
  }),
};
const db = {
  ...executor,
  transaction: async (run: (tx: typeof executor) => unknown) => run(executor),
};

const headersModule = await import("next/headers");
mock.module("next/headers", () => ({
  ...headersModule,
  cookies: async () => ({
    set: (name: string, value: string, options: Record<string, unknown>) => {
      cookieJar.push({ name, options, value });
    },
  }),
}));
const authModule = await import("@/lib/auth");
mock.module("@/lib/db", () => ({ db }));
mock.module("@/lib/auth", () => ({ ...authModule, requireSuperAdmin: async () => admin }));
mock.module("next/cache", () => ({ revalidatePath: () => {} }));

const { setGlobalModel, setWorkspaceActive, startViewAs } = await import("./admin");
const { adminAuditLog } = await import("@/lib/db/schema");
const { verifyViewAs, VIEW_AS_COOKIE } = await import("@/lib/admin-view-as");

function form(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

function auditRows() {
  return inserts.filter((row) => row.table === adminAuditLog).map((row) => row.values);
}

/** Next's redirect() throws; the digest names the target. */
async function redirectTarget(run: Promise<unknown>) {
  try {
    await run;
  } catch (error) {
    const digest = String((error as { digest?: string }).digest ?? "");
    if (digest.startsWith("NEXT_REDIRECT")) {
      return digest.split(";")[2];
    }
    throw error;
  }
  return null;
}

beforeEach(() => {
  inserts.length = 0;
  cookieJar.length = 0;
  selectRows = [];
});

describe("admin audit log", () => {
  test("deactivating a workspace writes an entry naming the workspace", async () => {
    await setWorkspaceActive(form({ active: "false", orgId }));
    expect(auditRows()).toEqual([
      expect.objectContaining({
        action: "workspace.deactivated",
        adminUserId: admin.id,
        targetOrgId: orgId,
      }),
    ]);
  });

  test("reactivating writes its own entry", async () => {
    await setWorkspaceActive(form({ active: "true", orgId }));
    expect(auditRows().map((row) => row.action)).toEqual(["workspace.reactivated"]);
  });

  test("a global model change is written inside its transaction with the model", async () => {
    await setGlobalModel(form({ feature: "chat", modelId: "fallback" }));
    expect(auditRows()).toEqual([
      expect.objectContaining({
        action: "model.global",
        adminUserId: admin.id,
        metadata: { feature: "chat", modelId: null },
        targetOrgId: null,
      }),
    ]);
  });
});

describe("startViewAs", () => {
  test("records the visit, sets a signed grant for the owner, and opens the app", async () => {
    selectRows = [{ email: "owner@acme.test", id: ownerId, workspaceName: "Acme Studio" }];
    const before = Date.now();

    expect(await redirectTarget(startViewAs(form({ orgId })))).toBe("/home");

    const [entry] = auditRows();
    expect(entry).toEqual(
      expect.objectContaining({
        action: "view-as.started",
        adminUserId: admin.id,
        metadata: { ownerEmail: "owner@acme.test", workspaceName: "Acme Studio" },
        targetOrgId: orgId,
        targetUserId: ownerId,
      }),
    );
    const expiresAt = entry.expiresAt as Date;
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 30 * 60_000);

    const [cookie] = cookieJar;
    expect(cookie.name).toBe(VIEW_AS_COOKIE);
    expect(cookie.options).toEqual(expect.objectContaining({ httpOnly: true, path: "/" }));
    expect(verifyViewAs(cookie.value)).toEqual({
      adminUserId: admin.id,
      exp: Math.floor(expiresAt.getTime() / 1000),
      orgId,
      userId: ownerId,
    });
  });

  test("refuses a workspace without an owner and writes nothing", async () => {
    selectRows = [];
    await expect(startViewAs(form({ orgId }))).rejects.toThrow("no owner");
    expect(auditRows()).toEqual([]);
    expect(cookieJar).toEqual([]);
  });
});
