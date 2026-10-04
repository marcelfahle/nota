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

test("super admin changes the temporary password, sees accounts, and changes models", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const adminEmail = `operator-${suffix}@example.com`;
  const temporaryPassword = `Temporary-${suffix}`;
  const permanentPassword = `Permanent-${suffix}`;

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

  const command = spawnSync(
    "bun",
    ["run", "admin:create", "--", "--email", adminEmail, "--password", temporaryPassword],
    { cwd: process.cwd(), encoding: "utf8", env: process.env },
  );
  expect(command.status, command.stderr).toBe(0);

  await page.goto("/login");
  await page.getByTestId("login-email").fill(adminEmail);
  await page.getByTestId("login-password").fill(temporaryPassword);
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/admin\/password$/);
  await expect(page.getByText("Choose a permanent password")).toBeVisible();

  await page.getByLabel("Temporary password").fill(temporaryPassword);
  await page.getByLabel("New password", { exact: true }).fill(permanentPassword);
  await page.getByLabel("Confirm new password").fill(permanentPassword);
  await page.getByRole("button", { name: "Set password" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByTestId("admin-workspaces")).toContainText(`Admin flow ${suffix}`);

  await db.insert(aiUsage).values({
    feature: "chat",
    inputTokens: 1_000_000,
    modelId: "claude-sonnet-5-5",
    orgId: membership.orgId,
    outputTokens: 100_000,
    userId: normalUser.id,
  });
  await page.reload();
  await expect(page.getByTestId("admin-workspaces")).toContainText("$4.50");

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
