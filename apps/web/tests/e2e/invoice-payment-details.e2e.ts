import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";

import { db } from "../../src/lib/db";
import { bankAccounts, orgMembers, users } from "../../src/lib/db/schema";
import { createClient, createDraftInvoice, registerAccount, uniqueSuffix } from "./helpers";

test("switches a draft's payment details and clears its old bank note", async ({ page }) => {
  const { email } = await registerAccount(page);
  const [owner] = await db
    .select({ orgId: orgMembers.orgId, userId: users.id })
    .from(users)
    .innerJoin(orgMembers, eq(orgMembers.userId, users.id))
    .where(eq(users.email, email));
  const [selected] = await db
    .insert(bankAccounts)
    .values([
      { ...owner, details: "Second account instructions", name: "Second account" },
      {
        ...owner,
        details: "Default account instructions",
        isDefault: true,
        name: "Default account",
      },
    ])
    .returning();
  const client = await createClient(page, uniqueSuffix());
  const { invoicePath } = await createDraftInvoice(page, client);
  await page.goto(invoicePath + "/edit");
  await page.locator("#notes").fill("Old payment note");
  await page.getByTestId("invoice-submit").click();
  await expect(page).toHaveURL(new RegExp(invoicePath + "$"));
  await expect(page.getByText("Old payment note", { exact: true }).first()).toBeVisible();
  await page.goto(invoicePath + "/edit");
  await page.getByLabel("Payment details").selectOption(selected.id);
  await page.locator("#notes").fill("");
  await page.getByTestId("invoice-submit").click();
  await expect(page).toHaveURL(new RegExp(invoicePath + "$"));
  await page.reload();
  await expect(
    page.getByText("Second account instructions", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("Default account instructions", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Old payment note", { exact: true })).toHaveCount(0);
  await page.goto(invoicePath + "/edit");
  await expect(page.locator("#notes")).toHaveValue("");
  await expect(page.getByLabel("Payment details")).toHaveValue(selected.id);
});
