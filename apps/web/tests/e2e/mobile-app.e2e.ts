import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";

import { db } from "../../src/lib/db";
import { orgMembers, orgs, users } from "../../src/lib/db/schema";
import { registerAccount } from "./helpers";

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
}

async function expectVisibleFieldsDoNotTriggerIosZoom(page: import("@playwright/test").Page) {
  const fields = page.locator('input:not([type="hidden"]), textarea, select');
  for (let index = 0; index < (await fields.count()); index++) {
    const field = fields.nth(index);
    if (await field.isVisible()) {
      expect(
        Number.parseFloat(await field.evaluate((element) => getComputedStyle(element).fontSize)),
      ).toBeGreaterThanOrEqual(16);
    }
  }
}

test("signed-in phone shell fits, keeps chat usable, and avoids input zoom", async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  const account = await registerAccount(page, "Mobile Studio");
  // This spec is about the everyday shell, so skip the first-run Home a new
  // account starts on (covered by first-run.e2e.ts).
  const [member] = await db
    .select({ orgId: orgMembers.orgId })
    .from(users)
    .innerJoin(orgMembers, eq(orgMembers.userId, users.id))
    .where(eq(users.email, account.email));
  await db.update(orgs).set({ firstRunCompletedAt: new Date() }).where(eq(orgs.id, member.orgId));
  await page.reload();

  await expectNoHorizontalOverflow(page);
  await expectVisibleFieldsDoNotTriggerIosZoom(page);

  const conversation = page.getByRole("region", { name: "Conversation with Nota" });
  await expect
    .poll(async () => {
      await page.evaluate(() => window.dispatchEvent(new Event("nota:open-home-chat")));
      return conversation.count();
    })
    .toBe(1);
  await expect(conversation).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectVisibleFieldsDoNotTriggerIosZoom(page);
  const pageTop = await page.evaluate(() => scrollY);
  const composer = page.getByRole("textbox", { name: "Ask Nota" });
  await composer.focus();
  await page.setViewportSize({ height: 500, width: 390 });
  await expect(composer).toBeInViewport();
  await expectNoHorizontalOverflow(page);
  expect(await page.evaluate(() => scrollY)).toBe(pageTop);
  await page.setViewportSize({ height: 844, width: 390 });
  await page.getByRole("button", { name: "Back to Home" }).click();

  await page.getByRole("button", { name: "Open navigation" }).click();
  const navigation = page.getByRole("navigation", { exact: true, name: "Main" });
  await expect(navigation).toBeVisible();
  await expect(navigation.getByRole("link", { exact: true, name: "Home" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await navigation.getByRole("link", { exact: true, name: "Clients" }).click();
  await expect(page).toHaveURL(/\/clients$/);
  await expect(navigation).toBeHidden();
  await expectNoHorizontalOverflow(page);

  await page.goto("/clients/new");
  await expectNoHorizontalOverflow(page);
  await expectVisibleFieldsDoNotTriggerIosZoom(page);
});
