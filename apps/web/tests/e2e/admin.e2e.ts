import { spawnSync } from "node:child_process";

import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";

import { db } from "../../src/lib/db";
import {
  aiModelChanges,
  aiModelSettings,
  aiUsage,
  aiWorkspaceModelOverrides,
  orgMembers,
  users,
} from "../../src/lib/db/schema";
import { logout, registerAccount, uniqueSuffix } from "./helpers";

function assertLocalTestDatabase() {
  const database = new URL(process.env.DATABASE_URL ?? "");
  const localHost = database.hostname === "localhost" || database.hostname === "127.0.0.1";
  const testDatabase = database.pathname === "/nota_amp" || database.pathname === "/nota_ci";
  if (!localHost || !testDatabase) {
    throw new Error("Admin E2E cleanup requires the local nota_amp or nota_ci database");
  }
}

test("super admin changes the temporary password, sees accounts, and changes models", async ({
  browser,
  page,
}) => {
  const suffix = uniqueSuffix();
  const adminEmail = `operator-${suffix}@example.com`;
  const temporaryPassword = `Temporary-${suffix}`;
  const permanentPassword = `Permanent-${suffix}`;

  assertLocalTestDatabase();
  await db.delete(aiModelChanges);
  await db.delete(aiWorkspaceModelOverrides);
  await db.delete(aiModelSettings);
  const existingAdmins = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.isSuperAdmin, true));
  for (const admin of existingAdmins) {
    await db.delete(users).where(eq(users.id, admin.id));
  }

  const account = await registerAccount(page, `Admin flow ${suffix}`);
  const [normalUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, account.email))
    .limit(1);
  const [membership] = await db
    .select({ orgId: orgMembers.orgId })
    .from(orgMembers)
    .where(eq(orgMembers.userId, normalUser.id))
    .limit(1);

  const forbidden = await page.goto("/admin");
  expect(forbidden?.status()).toBe(404);
  await logout(page);

  const command = spawnSync("bun", ["run", "admin:create", "--", "--email", adminEmail], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, SUPER_ADMIN_TEMP_PASSWORD: temporaryPassword },
  });
  expect(command.status, command.stderr).toBe(0);
  expect(command.stdout).not.toContain(temporaryPassword);

  await page.goto("/login");
  await page.getByTestId("login-email").fill(adminEmail);
  await page.getByTestId("login-password").fill(temporaryPassword);
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/admin\/password$/);
  await expect(page.getByText("Choose a permanent password")).toBeVisible();

  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  await otherPage.goto("/login");
  await otherPage.getByTestId("login-email").fill(adminEmail);
  await otherPage.getByTestId("login-password").fill(temporaryPassword);
  await otherPage.getByTestId("login-submit").click();
  await expect(otherPage).toHaveURL(/\/admin\/password$/);

  await page.getByLabel("Temporary password").fill(temporaryPassword);
  await page.getByLabel("New password", { exact: true }).fill(permanentPassword);
  await page.getByLabel("Confirm new password").fill(permanentPassword);
  await page.getByRole("button", { name: "Set password" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  const revokedSession = await otherPage.goto("/admin");
  expect(revokedSession?.status()).toBe(404);
  await otherContext.close();
  await expect(page.getByTestId("admin-workspaces")).toContainText(`Admin flow ${suffix}`);
  const missingWorkspace = await page.goto("/admin/workspaces/not-a-uuid");
  expect(missingWorkspace?.status()).toBe(404);
  await page.goto("/admin");

  await db.insert(aiUsage).values({
    feature: "chat",
    inputTokens: 1_000_000,
    modelId: "claude-sonnet-5-5",
    orgId: membership.orgId,
    outputTokens: 100_000,
    userId: normalUser.id,
  });
  await page.reload();
  await expect(page.getByTestId("admin-workspaces")).toContainText("$3.00");

  await page.goto("/admin/ai");
  await page.getByLabel("Model for In-app chat").selectOption("claude-haiku-4-5-20251001");
  await page
    .locator('form:has(label:text("Model for In-app chat"))')
    .getByRole("button", { name: "Save" })
    .click();
  await expect(
    page
      .locator("article")
      .filter({ hasText: "In-app chat" })
      .getByText(/active: claude-haiku/),
  ).toBeVisible();
  await page.getByLabel("Model for In-app chat").selectOption("fallback");
  await page
    .locator('form:has(label:text("Model for In-app chat"))')
    .getByRole("button", { name: "Save" })
    .click();
  await expect
    .poll(async () => {
      const [setting] = await db
        .select({ modelId: aiModelSettings.modelId })
        .from(aiModelSettings)
        .where(eq(aiModelSettings.feature, "chat"));
      return setting?.modelId;
    })
    .toBeUndefined();

  await page
    .getByLabel(`Chat model for Admin flow ${suffix}`)
    .selectOption("claude-sonnet-4-5-20250929");
  await page
    .locator(`form:has-text("Admin flow ${suffix}")`)
    .getByRole("button", { name: "Save" })
    .click();
  await expect
    .poll(async () => {
      const [override] = await db
        .select({ modelId: aiWorkspaceModelOverrides.modelId })
        .from(aiWorkspaceModelOverrides)
        .where(eq(aiWorkspaceModelOverrides.orgId, membership.orgId));
      return override?.modelId;
    })
    .toBe("claude-sonnet-4-5-20250929");

  await logout(page);
  await page.getByTestId("login-email").fill(adminEmail);
  await page.getByTestId("login-password").fill(permanentPassword);
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/admin$/);
});
