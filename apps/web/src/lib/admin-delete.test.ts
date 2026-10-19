import { expect, mock, test } from "bun:test";

// Workspace deletion in order: the workspace row, its sole members, its
// invoices, the originals those invoices stored. The fake database answers
// each select in that order; the deletes only need to resolve.
const orgId = "0f72f87b-3d4d-4f4b-85f8-f469e835c708";
const storedKeys = [
  `invoices/${orgId}/inv-1/INV-0001.pdf`,
  `invoices/${orgId}/inv-1/INV-0001.xml`,
  `invoices/${orgId}/inv-2/INV-0002.pdf`,
];
let selectAnswers: Array<Array<Record<string, unknown>>> = [];
const removedFiles: Array<Array<string>> = [];
const removedLogos: Array<unknown> = [];

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
mock.module("@/lib/invoice-documents", () => ({
  deleteInvoiceDocumentFiles: async (keys: Array<string>) => {
    removedFiles.push(keys);
  },
}));
mock.module("@/lib/logo-storage", () => ({
  deleteManagedLogo: async (url: unknown) => {
    removedLogos.push(url);
  },
}));

const { deleteWorkspace } = await import("./admin-delete");

test("deleting a workspace removes the stored originals of its invoices", async () => {
  selectAnswers = [
    [{ faviconUrl: null, id: orgId, logoUrl: "https://store/orgs/logo.png" }],
    [{ id: "user-1" }],
    [{ id: "inv-1" }, { id: "inv-2" }],
    storedKeys.map((storageKey) => ({ storageKey })),
  ];
  const result = await deleteWorkspace(orgId);
  expect(result).toEqual({ deleted: { clients: 0, invoices: 2, users: 1 } });
  expect(removedFiles).toEqual([storedKeys]);
  expect(removedLogos).toEqual(["https://store/orgs/logo.png", null]);
});

test("a workspace without invoices deletes no files", async () => {
  removedFiles.length = 0;
  selectAnswers = [[{ faviconUrl: null, id: orgId, logoUrl: null }], [], []];
  const result = await deleteWorkspace(orgId);
  expect(result).toEqual({ deleted: { clients: 0, invoices: 0, users: 0 } });
  expect(removedFiles).toEqual([[]]);
});

test("a workspace with a live subscription is left alone", async () => {
  removedFiles.length = 0;
  selectAnswers = [[{ id: orgId, stripeSubscriptionStatus: "active" }]];
  expect(await deleteWorkspace(orgId)).toEqual({
    error: "This workspace has a live subscription. Cancel it in Stripe first.",
  });
  expect(removedFiles).toEqual([]);
});
