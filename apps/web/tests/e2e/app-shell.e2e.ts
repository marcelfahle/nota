import { expect, test } from "@playwright/test";

import {
  createClient,
  createDraftInvoice,
  login,
  logout,
  registerAccount,
  uniqueSuffix,
} from "./helpers";

test("shell navigation, account themes, paper invoice and chat dock", async ({ browser, page }) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  const owner = await registerAccount(page, "Paper Studio");
  const nav = page.getByRole("navigation", { exact: true, name: "Main" });
  await expect(nav.getByRole("link", { exact: true, name: "Invoices" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("textbox", { name: "Ask Nota" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Close chat" })).toBeHidden();
  await page.getByTestId("chat-panel-toggle").click();
  await expect(page.getByRole("button", { name: "Close chat" })).toBeVisible();
  await page.getByRole("button", { name: "Close chat" }).click();
  await expect(page.getByRole("textbox", { name: "Ask Nota" })).toBeFocused();

  await page.goto("/settings");
  await page.getByLabel("Theme", { exact: true }).selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(24, 21, 18)");
  await page.reload();
  await expect(page.getByLabel("Theme", { exact: true })).toHaveValue("dark");

  // A fresh browser session must get the account preference, not local storage.
  const fresh = await browser.newContext();
  const otherPage = await fresh.newPage();
  await login(otherPage, owner.email, owner.password);
  await expect(otherPage.locator("html")).toHaveAttribute("data-theme", "dark");
  await fresh.close();

  const client = await createClient(page, uniqueSuffix());
  const invoice = await createDraftInvoice(page, client, "Design system implementation", "725");
  await page.goto(invoice.invoicePath);
  await expect(page.locator(".invoice-paper")).toHaveCSS("background-color", "rgb(255, 254, 251)");
  await expect(page.locator(".invoice-paper")).toHaveCSS("color", "rgb(31, 27, 22)");

  await page.setViewportSize({ height: 1000, width: 1440 });
  await page.goto("/invoices");
  await page.getByTestId("chat-panel-toggle").click();
  const row = page.getByTestId("invoice-list-row").first();
  // Actionability checks catch controls covered by the right-hand conversation panel.
  await row
    .getByRole("link", { name: `Download ${invoice.invoiceNumber} PDF` })
    .click({ trial: true });
  await row
    .getByRole("button", { name: `More actions for ${invoice.invoiceNumber}` })
    .click({ trial: true });
  await page.getByRole("button", { name: "Close chat" }).click();

  await page.goto("/settings");
  await page.getByLabel("Theme", { exact: true }).selectOption("system");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "system");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(24, 21, 18)");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(251, 249, 244)");
  await page.getByLabel("Theme", { exact: true }).selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(251, 249, 244)");

  await page.setViewportSize({ height: 844, width: 390 });
  await expect(nav).toBeHidden();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(nav).toBeVisible();
  await nav.getByRole("link", { exact: true, name: "Clients" }).click();
  await expect(page).toHaveURL(/\/clients$/);
  await expect(nav).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.getByTestId("chat-panel-toggle").click();
  const chat = page.getByRole("dialog", { name: "Nota Chat" });
  await expect(chat).toBeVisible();
  for (let index = 0; index < 12; index++) {
    await page.keyboard.press("Tab");
    expect(
      await chat.evaluate((element) => {
        // Native dialogs can yield focus to browser chrome (reported as BODY), never the page.
        return (
          element.matches(":modal") &&
          (element.contains(document.activeElement) || document.activeElement === document.body)
        );
      }),
    ).toBe(true);
  }
  expect(
    await page.locator("#main-content").evaluate((element) => {
      element.focus();
      return document.activeElement === element;
    }),
  ).toBe(false);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Close chat" })).toBeHidden();
  await expect(page.getByRole("textbox", { name: "Ask Nota" })).toBeFocused();

  await logout(page);
  await registerAccount(page, "Another Studio");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "system");
});
