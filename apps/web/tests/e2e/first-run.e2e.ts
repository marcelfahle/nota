import { expect, test } from "@playwright/test";
import { and, eq } from "drizzle-orm";

import { db } from "../../src/lib/db";
import { invoiceSends, invoices, jobs, orgMembers, orgs, users } from "../../src/lib/db/schema";
import { registerAccount, uniqueSuffix } from "./helpers";

const viewports = [
  { height: 900, label: "desktop", width: 1440 },
  { height: 844, label: "phone", width: 390 },
] as const;

for (const viewport of viewports) {
  test(`first invoice reaches a test copy at ${viewport.label} width`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewport);
    const account = await registerAccount(page, `First Run ${viewport.label}`);
    const suffix = uniqueSuffix();
    const clientName = `Acme ${suffix}`;
    const clientEmail = `billing-${suffix}@example.com`;
    const paper = page.getByTestId("first-run-invoice");

    await expect(page.getByRole("heading", { name: "Who’s the first one for?" })).toBeVisible();
    await expect(paper).toContainText("Your first client");
    await expect(paper).toContainText("What you did and what it costs");

    if (viewport.label === "phone") {
      const paperBox = await paper.boundingBox();
      const questionBox = await page
        .getByRole("heading", { name: "Who’s the first one for?" })
        .boundingBox();
      expect(paperBox).not.toBeNull();
      expect(questionBox).not.toBeNull();
      expect(paperBox!.y).toBeLessThan(questionBox!.y);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }

    await page
      .getByRole("textbox", { name: "Ask Nota" })
      .fill(`${clientName}, 3 days of design at €600, ${clientEmail}`);
    await page.getByRole("button", { name: "Draft it" }).click();
    await expect(paper).toContainText(clientName, { timeout: 45_000 });
    await expect(paper).toContainText("Design");
    await expect(paper).toContainText("€1,800.00");

    await page.getByRole("button", { name: /Legal name and address/ }).click();
    await page.getByLabel("Legal name").fill("First Run Studio SL");
    await page.getByLabel("Street and number").fill("Carrer Major 12");
    await page.getByLabel("Postal code").fill("03700");
    await page.getByLabel("City").fill("Dénia");
    await page.getByLabel("Country").fill("Spain");
    await page.getByRole("button", { name: "Save legal details" }).click();
    await expect(paper).toContainText("First Run Studio SL");
    await expect(paper).toContainText("03700 Dénia, Spain");

    await page.getByRole("button", { name: "2 Bank details" }).click();
    await page.getByLabel("Account holder").fill("First Run Studio SL");
    await page.getByLabel("IBAN").fill("DE89370400440532013000");
    await page.getByLabel("BIC (optional)").fill("COBADEFFXXX");
    await page.getByRole("button", { name: "Save bank details" }).click();
    await expect(paper.getByRole("button", { name: /Pay by bank transfer/ })).toBeVisible();

    const sendTest = page.getByRole("button", { name: "Send it to me first" });
    await expect(sendTest).toBeEnabled();
    await sendTest.click();
    await expect(page.getByRole("button", { name: "Test copy sent" })).toBeVisible();
    await expect(page.getByText(`Test copy queued for ${account.email}.`)).toBeVisible();

    const [context] = await db
      .select({ org: orgs, user: users })
      .from(users)
      .innerJoin(orgMembers, eq(orgMembers.userId, users.id))
      .innerJoin(orgs, eq(orgs.id, orgMembers.orgId))
      .where(eq(users.email, account.email))
      .limit(1);
    const [invoice] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.orgId, context.org.id))
      .limit(1);
    const [testJob] = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.invoiceId, invoice.id), eq(jobs.type, "send_invoice_test_email")))
      .limit(1);
    expect(testJob.payload).toMatchObject({ invoiceId: invoice.id, recipient: account.email });
    expect(invoice.status).toBe("draft");
    expect(context.org.firstRunCompletedAt).toBeNull();
    expect(context.org.profileSources?.legalName).toMatchObject({
      confirmed: true,
      source: "user",
    });
    expect(
      await db.select().from(invoiceSends).where(eq(invoiceSends.invoiceId, invoice.id)),
    ).toHaveLength(0);

    if (viewport.label === "desktop") {
      await page.getByRole("button", { name: "Send invoice" }).click();
      await expect(page.getByTestId("first-run-verify")).toContainText(account.email);

      await db.update(users).set({ emailVerified: true }).where(eq(users.id, context.user.id));
      await page.reload();
      await page.getByRole("button", { name: "Send invoice" }).click();
      await expect(page.getByTestId("first-run-invoice")).toHaveCount(0);
      await expect(page.getByRole("heading", { name: /in so far this/ })).toBeVisible();

      const [sentInvoice] = await db
        .select({ status: invoices.status })
        .from(invoices)
        .where(eq(invoices.id, invoice.id));
      const [completedOrg] = await db
        .select({ firstRunCompletedAt: orgs.firstRunCompletedAt })
        .from(orgs)
        .where(eq(orgs.id, context.org.id));
      expect(sentInvoice.status).toBe("sent");
      expect(completedOrg.firstRunCompletedAt).not.toBeNull();
      expect(
        await db.select().from(invoiceSends).where(eq(invoiceSends.invoiceId, invoice.id)),
      ).toHaveLength(1);
    }
  });
}
