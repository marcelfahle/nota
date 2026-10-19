import { expect, mock, test } from "bun:test";

// Workspace deletion in order: the workspace row, its sole members, its
// invoices, the originals those invoices stored. The fake database answers
// each select in that order; the deletes only need to resolve. The files are
// real, in the throwaway storage root from the test preload.
const orgId = "0f72f87b-3d4d-4f4b-85f8-f469e835c708";
const storedKeys = [
  `invoices/${orgId}/inv-1/INV-0001.pdf`,
  `invoices/${orgId}/inv-1/INV-0001.xml`,
  `invoices/${orgId}/inv-2/INV-0002.pdf`,
];
let selectAnswers: Array<Array<Record<string, unknown>>> = [];

function query(result: Array<Record<string, unknown>>) {
  const step: Record<string, unknown> = {};
  for (const name of ["from", "innerJoin", "limit", "returning", "set", "where"]) {
    step[name] = () => query(result);
  }
  step.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return step;
}
const database = {
  delete: () => query([]),
  select: () => query(selectAnswers.shift() ?? []),
  transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(database),
  update: () => query([]),
};
mock.module("@/lib/db", () => ({ db: database }));

const { putPrivateFile, readPrivateFile } = await import("@/lib/file-storage");
const { deleteWorkspace } = await import("./admin-delete");

async function storedFileCount() {
  const contents = await Promise.all(storedKeys.map((key) => readPrivateFile(key)));
  return contents.filter(Boolean).length;
}

test("deleting a workspace removes the stored originals of its invoices", async () => {
  for (const key of storedKeys) {
    await putPrivateFile(key, Buffer.from(`original ${key}`), "application/octet-stream");
  }
  expect(await storedFileCount()).toBe(3);
  selectAnswers = [
    [{ faviconUrl: null, id: orgId, logoUrl: null }],
    [{ id: "user-1" }],
    [{ id: "inv-1" }, { id: "inv-2" }],
    storedKeys.map((storageKey) => ({ storageKey })),
  ];
  const result = await deleteWorkspace(orgId);
  expect(result).toEqual({ deleted: { clients: 0, invoices: 2, users: 1 } });
  expect(await storedFileCount()).toBe(0);
});

test("a workspace without invoices touches no files", async () => {
  await putPrivateFile(storedKeys[0], Buffer.from("someone else's"), "application/octet-stream");
  selectAnswers = [[{ faviconUrl: null, id: orgId, logoUrl: null }], [], []];
  const result = await deleteWorkspace(orgId);
  expect(result).toEqual({ deleted: { clients: 0, invoices: 0, users: 0 } });
  expect(await storedFileCount()).toBe(1);
});

test("a workspace with a live subscription is left alone", async () => {
  selectAnswers = [[{ id: orgId, stripeSubscriptionStatus: "active" }]];
  expect(await deleteWorkspace(orgId)).toEqual({
    error: "This workspace has a live subscription. Cancel it in Stripe first.",
  });
  expect(await storedFileCount()).toBe(1);
});
