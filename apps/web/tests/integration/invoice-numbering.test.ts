import { beforeAll, expect, mock, test } from "bun:test";
import { randomUUID } from "node:crypto";

import { and, asc, eq, inArray } from "drizzle-orm";

if (!process.env.DATABASE_URL?.startsWith("postgresql://postgres@127.0.0.1:5433/nota51_")) {
  throw new Error("Use a disposable nota51_* database on local port 5433");
}

process.env.STRIPE_MODE = "connect";
mock.module("@/lib/jobs", () => ({ processPendingEmailJobs: async () => ({ completed: 0 }) }));

const { db } = await import("../../src/lib/db");
const { clients, invoiceNumberEvents, invoices, orgs, users } =
  await import("../../src/lib/db/schema");
const {
  cancelInvoice,
  createCreditNote,
  createInvoice,
  deleteInvoice,
  markInvoiceSent,
  sendInvoice,
} = await import("../../src/lib/invoice-service");

const userId = randomUUID();
const orgId = randomUUID();
let clientId: string;
const context = { orgId, role: "owner" as const, source: "api" as const, userId };
const input = {
  clientId: "",
  currency: "EUR",
  dueAt: "2026-11-30",
  issuedAt: "2026-10-05",
  lineItems: [{ description: "Numbering test", quantity: 1, unitPrice: 10 }],
  reverseCharge: "false",
  taxRate: 0,
};

async function createDraft() {
  const result = await createInvoice(context, { ...input, clientId });
  if ("error" in result) {
    throw new Error(result.error);
  }
  return result.invoiceId;
}

beforeAll(async () => {
  await db.insert(users).values({ email: `${userId}@example.test`, id: userId, name: "NOTA-51" });
  await db.insert(orgs).values({
    firstRunCompletedAt: new Date(),
    id: orgId,
    name: "NOTA-51",
    plan: "pro",
  });
  const [client] = await db
    .insert(clients)
    .values({ email: "billing@example.test", name: "Client", orgId, userId })
    .returning({ id: clients.id });
  clientId = client.id;
});

test("draft create/delete does not consume an issued number and leaves an audit trail", async () => {
  const deletedId = await createDraft();
  const keptId = await createDraft();
  const [before] = await db.select().from(orgs).where(eq(orgs.id, orgId));
  expect(before.nextInvoiceNumber).toBe(1);

  expect(await deleteInvoice(context, deletedId)).toEqual({ invoiceId: deletedId, success: true });
  expect(await markInvoiceSent(context, keptId)).toEqual({ invoiceId: keptId, success: true });

  const [issued] = await db.select().from(invoices).where(eq(invoices.id, keptId));
  expect(issued.number).toBe("INV-0001");
  const deletedEvents = await db
    .select()
    .from(invoiceNumberEvents)
    .where(
      and(
        eq(invoiceNumberEvents.orgId, orgId),
        inArray(invoiceNumberEvents.action, ["draft_created", "draft_deleted"]),
      ),
    );
  expect(deletedEvents.filter((event) => event.number.includes(deletedId))).toHaveLength(2);
  expect(
    deletedEvents
      .filter((event) => event.number.includes(deletedId))
      .every((event) => !event.invoiceId),
  ).toBe(true);
});

test("a rejected send leaves the draft identifier and counter unchanged", async () => {
  const id = await createDraft();
  const [before] = await db.select().from(orgs).where(eq(orgs.id, orgId));
  await db.update(orgs).set({ firstRunCompletedAt: null }).where(eq(orgs.id, orgId));

  expect(await sendInvoice(context, id)).toEqual({
    error: "Confirm your email address before sending your first invoice.",
  });
  const [draft] = await db.select().from(invoices).where(eq(invoices.id, id));
  const [after] = await db.select().from(orgs).where(eq(orgs.id, orgId));
  expect(draft.number).toStartWith("DRAFT-");
  expect(after.nextInvoiceNumber).toBe(before.nextInvoiceNumber);

  await db.update(orgs).set({ firstRunCompletedAt: new Date() }).where(eq(orgs.id, orgId));
  await deleteInvoice(context, id);
});

test("concurrent issuance is serialized without duplicate numbers", async () => {
  const ids = await Promise.all(Array.from({ length: 12 }, createDraft));
  const results = await Promise.all(ids.map((id) => markInvoiceSent(context, id)));
  expect(results.every((result) => "success" in result)).toBe(true);

  const rows = await db
    .select({ number: invoices.number })
    .from(invoices)
    .where(inArray(invoices.id, ids))
    .orderBy(asc(invoices.number));
  expect(rows.map((row) => row.number)).toEqual(
    Array.from({ length: 12 }, (_, index) => `INV-${String(index + 2).padStart(4, "0")}`),
  );
  expect(new Set(rows.map((row) => row.number)).size).toBe(12);
});

test("cancellation retains and accounts for the issued number", async () => {
  const id = await createDraft();
  await markInvoiceSent(context, id);
  const [issued] = await db.select().from(invoices).where(eq(invoices.id, id));
  expect(await cancelInvoice(context, id)).toMatchObject({ success: true });
  const [cancelled] = await db.select().from(invoices).where(eq(invoices.id, id));
  expect(cancelled).toMatchObject({ number: issued.number, status: "cancelled" });
  const events = await db
    .select({ action: invoiceNumberEvents.action, number: invoiceNumberEvents.number })
    .from(invoiceNumberEvents)
    .where(eq(invoiceNumberEvents.invoiceId, id));
  expect(events).toContainEqual({ action: "cancelled", number: issued.number });
});

test("credit notes use a separate series allocated only when sent", async () => {
  const originalId = await createDraft();
  await markInvoiceSent(context, originalId);
  const result = await createCreditNote(context, originalId);
  if ("error" in result) {
    throw new Error(result.error);
  }
  const [draft] = await db.select().from(invoices).where(eq(invoices.id, result.invoiceId));
  expect(draft.number).toStartWith("DRAFT-");
  expect((await db.select().from(orgs).where(eq(orgs.id, orgId)))[0].nextCreditNoteNumber).toBe(1);

  expect(await sendInvoice(context, result.invoiceId)).toMatchObject({ success: true });
  const [credit] = await db.select().from(invoices).where(eq(invoices.id, result.invoiceId));
  expect(credit).toMatchObject({ kind: "credit_note", number: "CN-0001", status: "sent" });
  const [original] = await db.select().from(invoices).where(eq(invoices.id, originalId));
  expect(original.status).toBe("cancelled");
});
