import { expect, test } from "@playwright/test";

import {
  acceptInvite,
  createClient,
  createDraftInvoice,
  createInvite,
  login,
  registerAccount,
  uniqueSuffix,
} from "./helpers";

test("enforces role-scoped actions across owners, admins, and members", async ({
  browser,
  page,
}) => {
  const suffix = uniqueSuffix();
  const adminEmail = `admin-${suffix}@example.com`;
  const adminPassword = `Admin-${suffix}`;
  const memberEmail = `member-${suffix}@example.com`;
  const memberPassword = `Member-${suffix}`;

  await registerAccount(page);

  await page.goto("/settings");
  await page.locator('[data-testid^="team-remove-member-"]').first().click();
  await expect(page.getByTestId("team-feedback")).toContainText("Cannot remove the last owner");

  const adminInviteUrl = await createInvite(page, adminEmail, "Admin");
  const memberInviteUrl = await createInvite(page, memberEmail, "Member");

  await acceptInvite(browser, adminInviteUrl, adminPassword, "Playwright Admin");
  await acceptInvite(browser, memberInviteUrl, memberPassword, "Playwright Member");

  const clientName = await createClient(page, `${suffix}-shared`);
  const sharedInvoice = await createDraftInvoice(page, clientName, "Shared kickoff", "750");

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await login(adminPage, adminEmail, adminPassword);
  await adminPage.goto(sharedInvoice.invoicePath);
  await expect(adminPage.getByTestId("invoice-send")).toBeVisible();
  await adminPage.getByTestId("invoice-mark-sent").click();
  await expect(adminPage.getByTestId("invoice-status")).toContainText("sent");
  await adminContext.close();

  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  await login(memberPage, memberEmail, memberPassword);
  await memberPage.goto("/settings");
  await expect(
    memberPage.getByText("Only organization owners can update these settings."),
  ).toBeVisible();
  await expect(memberPage.getByTestId("team-settings")).toHaveCount(0);
  await expect(memberPage.getByTestId("api-keys-settings")).toHaveCount(0);

  const memberInvoice = await createDraftInvoice(
    memberPage,
    clientName,
    "Member draft invoice",
    "250",
  );
  await memberPage.goto(memberInvoice.invoicePath);
  await expect(memberPage.getByTestId("invoice-status")).toContainText("draft");
  await expect(memberPage.getByTestId("invoice-send")).toHaveCount(0);
  await expect(memberPage.getByTestId("invoice-mark-sent")).toHaveCount(0);
  await expect(memberPage.getByTestId("invoice-delete-draft")).toHaveCount(0);
  await memberContext.close();
});

test("keeps invoice and client lists isolated between organizations", async ({ browser, page }) => {
  const suffix = uniqueSuffix();

  await registerAccount(page, "Org A Owner");
  const clientName = await createClient(page, `${suffix}-org-a`);
  const invoice = await createDraftInvoice(page, clientName, "Isolation audit", "900");

  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  await registerAccount(otherPage, "Org B Owner");

  await otherPage.goto("/clients");
  await expect(otherPage.getByText(clientName)).toHaveCount(0);

  await otherPage.goto("/invoices");
  await expect(otherPage.getByText(invoice.invoiceNumber)).toHaveCount(0);
  await otherContext.close();
});
