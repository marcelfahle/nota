import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";

import { db } from "../../src/lib/db";
import { invoices, jobs, orgMembers, payments, proposals, users } from "../../src/lib/db/schema";
import { createReminderProposal } from "../../src/lib/proposal-service";
import { createClient, createDraftInvoice, registerAccount, uniqueSuffix } from "./helpers";

test("Home reflects derived balances and sends an approved reminder", async ({ page }) => {
  const account = await registerAccount(page, "Home Studio");
  const clientName = await createClient(page, uniqueSuffix());
  const invoice = await createDraftInvoice(page, clientName, "Monthly consulting", "500");
  const invoiceId = invoice.invoicePath.split("/").at(-1);
  if (!invoiceId) {
    throw new Error("Expected an invoice ID");
  }

  const [context] = await db
    .select({ orgId: orgMembers.orgId, userId: users.id })
    .from(users)
    .innerJoin(orgMembers, eq(orgMembers.userId, users.id))
    .where(eq(users.email, account.email))
    .limit(1);
  if (!context) {
    throw new Error("Expected the registered account context");
  }

  const dueAt = new Date();
  dueAt.setUTCDate(dueAt.getUTCDate() - 9);
  await db
    .update(invoices)
    .set({ dueAt: dueAt.toISOString().slice(0, 10), sentAt: new Date(), status: "overdue" })
    .where(eq(invoices.id, invoiceId));
  await db.insert(payments).values({
    amount: "125.00",
    currency: "EUR",
    invoiceId,
    method: "bank_transfer",
    orgId: context.orgId,
    receivedAt: new Date(),
    source: "web",
  });
  const proposal = await createReminderProposal(
    { orgId: context.orgId, role: "owner", source: "web", userId: context.userId },
    invoiceId,
    "I wrote a short reminder",
  );
  if (!("proposal" in proposal)) {
    throw new Error(proposal.error);
  }

  await page.goto("/home");
  await expect(page.getByRole("heading", { name: /€125\.00 in so far this/ })).toBeVisible();
  await expect(page.getByText("€375.00 still owed to you,", { exact: false })).toBeVisible();
  await expect(page.getByText("€375.00 of it late.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Home 1/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Invoices 1 late/ })).toBeVisible();

  const recent = page.getByRole("region", { name: "Recent" });
  await expect(recent.getByText(invoice.invoiceNumber)).toBeVisible();
  await expect(recent.getByText("Part paid")).toBeVisible();
  await expect(recent.getByText("€500.00")).toBeVisible();

  const ready = page.getByRole("region", { name: "Ready for you" });
  await expect(ready).toContainText(`${clientName} is 9 days late on €375.00`);
  await ready.getByRole("button", { name: "Send reminder" }).click();
  await expect(ready).toContainText("You’re all caught up.");

  const [savedProposal] = await db
    .select({ status: proposals.status })
    .from(proposals)
    .where(eq(proposals.id, proposal.proposal.id));
  expect(savedProposal?.status).toBe("approved");
  const [job] = await db
    .select({ proposalId: jobs.payload })
    .from(jobs)
    .where(eq(jobs.invoiceId, invoiceId));
  expect(job?.proposalId).toMatchObject({ proposalId: proposal.proposal.id });
});
