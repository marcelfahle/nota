import { expect, test, type Page } from "@playwright/test";

function uniqueSuffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function registerAccount(page: Page) {
  const suffix = uniqueSuffix();
  const email = `playwright-${suffix}@example.com`;
  const password = `Playwright-${suffix}`;

  await page.goto("/register");
  await page.getByTestId("register-name").fill("Playwright Owner");
  await page.getByTestId("register-email").fill(email);
  await page.getByTestId("register-password").fill(password);
  await page.getByTestId("register-submit").click();
  await expect(page).toHaveURL(/\/invoices$/);

  return { email, password };
}

async function createClient(page: Page, suffix: string) {
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

async function selectClient(page: Page, clientName: string) {
  await page.getByTestId("invoice-client-select").click();
  await page.getByRole("option", { name: clientName }).click();
}

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
