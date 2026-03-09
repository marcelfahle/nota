import { expect, type Browser, type Page } from "@playwright/test";

export function uniqueSuffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/invoices$/);
}

export async function logout(page: Page) {
  await page.goto("/settings");
  await page.getByTestId("logout-button").click();
  await expect(page).toHaveURL(/\/login$/);
}

export async function registerAccount(page: Page, name = "Playwright Owner") {
  const suffix = uniqueSuffix();
  const email = `playwright-${suffix}@example.com`;
  const password = `Playwright-${suffix}`;

  await page.goto("/register");
  await page.getByTestId("register-name").fill(name);
  await page.getByTestId("register-email").fill(email);
  await page.getByTestId("register-password").fill(password);
  await page.getByTestId("register-submit").click();
  await expect(page).toHaveURL(/\/invoices$/);

  return { email, password };
}

export async function createClient(page: Page, suffix: string) {
  const clientName = `Browser Client ${suffix}`;

  await page.goto("/clients/new");
  await page.getByTestId("client-name").fill(clientName);
  await page.getByTestId("client-email").fill(`client-${suffix}@example.com`);
  await page.getByTestId("client-company").fill("Browser Testing GmbH");
  await page.getByRole("button", { name: "Create Client" }).click();
  await expect(page).toHaveURL(/\/clients$/);
  await expect(page.getByText(clientName)).toBeVisible();

  return clientName;
}

export async function selectClient(page: Page, clientName: string) {
  await page.getByTestId("invoice-client-select").click();
  await page.getByRole("option", { name: clientName }).click();
}

export async function createDraftInvoice(
  page: Page,
  clientName: string,
  description = "Monthly consulting retainer",
  amount = "500",
) {
  await page.goto("/invoices/new");
  await selectClient(page, clientName);
  await page.getByTestId("invoice-line-item-description-0").fill(description);
  await page.getByTestId("invoice-line-item-unit-price-0").fill(amount);
  await page.getByTestId("invoice-submit").click();

  await expect(page).toHaveURL(/\/invoices$/);
  await page.goto("/invoices?status=draft");
  await expect(page).toHaveURL(/\/invoices\?status=draft$/);

  const invoiceLink = page.locator('tbody a[href^="/invoices/"]').first();
  await expect(invoiceLink).toBeVisible();

  const invoicePath = await invoiceLink.getAttribute("href");
  const invoiceNumber = (await invoiceLink.textContent())?.trim();

  if (!invoicePath || !invoiceNumber) {
    throw new Error("Expected invoice link and number after creating a draft invoice");
  }

  return { invoiceNumber, invoicePath };
}

export async function createInvite(page: Page, email: string, role: "Admin" | "Member" | "Owner") {
  await page.goto("/settings");
  await page.getByTestId("team-invite-email").fill(email);
  await page.getByTestId("team-invite-role").click();
  await page.getByRole("option", { name: role }).click();
  await page.getByTestId("team-invite-submit").click();

  const inviteRow = page
    .locator('[data-testid^="team-invite-row-"]')
    .filter({ hasText: email })
    .first();
  await expect(inviteRow).toBeVisible();

  const inviteUrl = await inviteRow
    .locator('[data-testid^="team-open-invite-"]')
    .getAttribute("href");

  if (!inviteUrl) {
    throw new Error("Expected invite URL to be present");
  }

  return inviteUrl;
}

export async function acceptInvite(
  browser: Browser,
  inviteUrl: string,
  password: string,
  name = "Playwright Teammate",
) {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(inviteUrl);
  await expect(page.getByTestId("register-invite-banner")).toBeVisible();
  await page.getByTestId("register-name").fill(name);
  await page.getByTestId("register-password").fill(password);
  await page.getByTestId("register-submit").click();
  await expect(page).toHaveURL(/\/invoices$/);

  await context.close();
}
