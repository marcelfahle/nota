import { expect, test } from "@playwright/test";

import { acceptInvite, createClient, registerAccount, selectClient, uniqueSuffix } from "./helpers";

test("registers, signs out, and signs back in", async ({ page }) => {
  const credentials = await registerAccount(page);

  // Sign out lives in the sidebar and lands on a fresh sign-in page.
  await page.getByTestId("logout-button").click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByTestId("login-email").fill(credentials.email);
  await page.getByTestId("login-password").fill(credentials.password);
  await page.getByTestId("login-submit").click();

  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("heading", { name: "Welcome to Nota." })).toBeVisible();
});

test("updates organization settings and reflects branding", async ({ page }) => {
  const suffix = uniqueSuffix();
  await registerAccount(page);
  const businessName = `Nota Studio ${suffix}`;

  await page.goto("/settings");
  await page.getByRole("button", { name: /(?:Add|Edit) Name/ }).click();
  await page.getByPlaceholder("Your business name").fill(businessName);
  const preview = page.getByTestId("brand-invoice-preview");
  const payButton = preview.getByText("Pay €4,800.00");
  await expect(preview).toContainText(businessName);
  await expect(payButton).toHaveCSS("color", "rgb(31, 27, 22)");
  await page.getByLabel("Custom brand colour").fill("#797979");
  await expect(payButton).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(payButton).toHaveCSS("background-color", "rgb(121, 121, 121)");
  await page.getByLabel("Custom brand colour").fill("#000");
  await expect(payButton).toHaveCSS("color", "rgb(255, 255, 255)");
  await page.getByRole("button", { name: "Save brand" }).click();

  await expect(page.getByText("Brand updated.")).toBeVisible();
  await expect(
    page.getByRole("complementary").getByRole("link", { exact: true, name: businessName }),
  ).toBeVisible();
  await expect(page.getByTestId("brand-field-businessName")).toContainText("confirmed by you");
  await page.reload();
  await expect(page.getByTestId("brand-invoice-preview")).toContainText(businessName);
  await expect(page.getByLabel("Custom brand colour")).toHaveValue("#000000");
});

test("creates and deletes an API key from settings", async ({ page }) => {
  const suffix = uniqueSuffix();
  const keyName = `Local CLI ${suffix}`;

  await registerAccount(page);
  await page.goto("/settings");
  await page.getByRole("tab", { name: "API" }).click();

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
  await page.getByRole("tab", { name: "Team" }).click();

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

  const invoiceRow = page.getByTestId("invoice-list-row").first();
  const invoiceLink = invoiceRow.locator('a[href^="/invoices/"]').first();
  await expect(invoiceLink).toBeVisible();
  const invoiceNumber = (await invoiceLink.textContent())?.trim();
  if (!invoiceNumber) {
    throw new Error("Expected invoice number in the invoice list");
  }

  await expect(
    invoiceRow.getByRole("link", { name: `Download ${invoiceNumber} PDF` }),
  ).toBeVisible();
  await expect(
    invoiceRow.getByRole("button", {
      name: `More actions for ${invoiceNumber}`,
    }),
  ).toBeVisible();
  await invoiceLink.click();

  await expect(page).toHaveTitle(`${invoiceNumber} · ${clientName} — nota`);
  await expect(page.getByTestId("invoice-status")).toContainText("Draft");

  await page.getByTestId("invoice-mark-sent").click();
  await expect(page.getByTestId("invoice-status")).toContainText("Sent");

  await page.getByTestId("invoice-record-payment").click();
  await page.getByLabel("Amount (EUR)").fill("200");
  await page.getByTestId("invoice-payment-submit").click();
  await expect(page.getByTestId("invoice-status")).toContainText("Part paid");
  await expect(page.getByText("€300.00").first()).toBeVisible();
  await expect(page.getByText("€200.00 payment recorded")).toBeVisible();

  await page.getByTestId("invoice-record-payment").click();
  await page.getByTestId("invoice-payment-submit").click();
  await expect(page.getByTestId("invoice-status")).toContainText("Paid");
  await expect(page.getByText(/payment recorded/i).first()).toBeVisible();
});
