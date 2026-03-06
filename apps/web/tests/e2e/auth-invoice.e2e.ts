import { expect, test } from "@playwright/test";

import { acceptInvite, createClient, registerAccount, selectClient, uniqueSuffix } from "./helpers";

test("registers, signs out, and signs back in", async ({ page }) => {
  const credentials = await registerAccount(page);

  await page.goto("/settings");
  await page.getByTestId("logout-button").click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByTestId("login-email").fill(credentials.email);
  await page.getByTestId("login-password").fill(credentials.password);
  await page.getByTestId("login-submit").click();

  await expect(page).toHaveURL(/\/invoices$/);
  await expect(page.getByRole("heading", { name: "Invoices" })).toBeVisible();
});

test("updates organization settings and reflects branding", async ({ page }) => {
  const suffix = uniqueSuffix();
  await registerAccount(page);
  const businessName = `Nota Studio ${suffix}`;

  await page.goto("/settings");
  await page.getByLabel("Business Name").fill(businessName);
  await page.getByRole("button", { name: "Save Settings" }).click();

  await expect(page.getByText("Settings saved")).toBeVisible();
  await expect(page.locator("header").getByText(businessName)).toBeVisible();
});

test("creates and deletes an API key from settings", async ({ page }) => {
  const suffix = uniqueSuffix();
  const keyName = `Local CLI ${suffix}`;

  await registerAccount(page);
  await page.goto("/settings");

  await page.getByTestId("api-keys-name").fill(keyName);
  await page.getByTestId("api-keys-submit").click();

  await expect(page.getByTestId("api-key-copy-created")).toBeVisible();
  await expect(page.getByTestId("api-keys-settings")).toContainText("nota_");
  await expect(page.getByTestId("api-keys-table")).toContainText(keyName);

  await page.locator(`tr:has-text("${keyName}")`).getByRole("button", { name: "Delete" }).click();
  await expect(page.locator(`tr:has-text("${keyName}")`)).toHaveCount(0);
});

test("owner invites a teammate who joins from the invite link", async ({ browser, page }) => {
  const suffix = uniqueSuffix();
  const teammateEmail = `teammate-${suffix}@example.com`;
  const teammatePassword = `Teammate-${suffix}`;

  await registerAccount(page);
  await page.goto("/settings");

  await page.getByTestId("team-invite-email").fill(teammateEmail);
  await page.getByTestId("team-invite-role").click();
  await page.getByRole("option", { name: "Admin" }).click();
  await page.getByTestId("team-invite-submit").click();

  const inviteLink = page.locator('[data-testid^="team-open-invite-"]').first();
  await expect(inviteLink).toBeVisible();
  const inviteUrl = await inviteLink.getAttribute("href");
  if (!inviteUrl) {
    throw new Error("Expected invite URL to be present");
  }

  await acceptInvite(browser, inviteUrl, teammatePassword);

  await page.goto("/settings");
  await expect(page.getByTestId("team-members-table")).toContainText(teammateEmail);
  await expect(page.getByTestId("team-members-table")).toContainText("Admin");
  await expect(page.locator('[data-testid^="team-invite-row-"]')).toHaveCount(0);
});

test("creates a client and moves an invoice through the manual lifecycle", async ({ page }) => {
  const suffix = uniqueSuffix();
  await registerAccount(page);
  const clientName = await createClient(page, suffix);

  await page.goto("/invoices/new");
  await selectClient(page, clientName);
  await page.getByTestId("invoice-line-item-description-0").fill("Monthly consulting retainer");
  await page.getByTestId("invoice-line-item-unit-price-0").fill("500");
  await page.getByTestId("invoice-submit").click();

  await expect(page).toHaveURL(/\/invoices$/);

  const invoiceLink = page.locator('tbody a[href^="/invoices/"]').first();
  await expect(invoiceLink).toBeVisible();
  await invoiceLink.click();

  await expect(page.getByTestId("invoice-status")).toContainText("draft");

  await page.getByTestId("invoice-mark-sent").click();
  await expect(page.getByTestId("invoice-status")).toContainText("sent");

  await page.getByTestId("invoice-mark-paid").click();
  await expect(page.getByTestId("invoice-status")).toContainText("paid");
  await expect(page.getByText("Payment received")).toBeVisible();
});
