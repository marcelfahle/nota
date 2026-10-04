import { expect, test } from "@playwright/test";
import { and, eq } from "drizzle-orm";

import { db } from "../../src/lib/db";
import {
  activityLog,
  clients,
  invoices,
  orgMembers,
  payments,
  users,
} from "../../src/lib/db/schema";
import { createClient, registerAccount, uniqueSuffix } from "./helpers";

test("invoice list supports its richer statuses, filters, search, actions, and phone table", async ({
  page,
}) => {
  const account = await registerAccount(page, "Invoice List Studio");
  const clientName = await createClient(page, uniqueSuffix());
  const [context] = await db
    .select({ clientId: clients.id, orgId: orgMembers.orgId, userId: users.id })
    .from(users)
    .innerJoin(orgMembers, eq(orgMembers.userId, users.id))
    .innerJoin(clients, and(eq(clients.orgId, orgMembers.orgId), eq(clients.name, clientName)))
    .where(eq(users.email, account.email))
    .limit(1);
  if (!context) {
    throw new Error("Expected invoice list test context");
  }

  const issuedAt = dateFromToday(-30);
  const dueAt = dateFromToday(30);
  const seeded = await db
    .insert(invoices)
    .values([
      invoice(context, "LIST-DRAFT", "2400.00", issuedAt, dueAt, "draft", "web"),
      invoice(context, "LIST-OPENED", "2970.00", issuedAt, dueAt, "sent", "mcp", "Claude"),
      invoice(context, "LIST-PART", "4800.00", issuedAt, dueAt, "sent", "chat"),
      invoice(context, "LIST-LATE", "2380.00", issuedAt, dateFromToday(-9), "overdue", "cli"),
      invoice(context, "LIST-PAID", "875.00", issuedAt, dueAt, "paid", "api"),
    ])
    .returning({ id: invoices.id, number: invoices.number });
  const opened = seeded.find(({ number }) => number === "LIST-OPENED");
  const partPaid = seeded.find(({ number }) => number === "LIST-PART");
  if (!opened || !partPaid) {
    throw new Error("Expected seeded invoices");
  }

  await db.insert(activityLog).values(
    Array.from({ length: 3 }, () => ({
      action: "viewed",
      invoiceId: opened.id,
      source: "system" as const,
    })),
  );
  await db.insert(payments).values({
    amount: "1800.00",
    currency: "EUR",
    invoiceId: partPaid.id,
    method: "bank_transfer",
    orgId: context.orgId,
    receivedAt: new Date(),
    source: "web",
  });

  await page.goto("/invoices");
  await expect(page.getByRole("heading", { name: "Invoices" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Export/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "New invoice" })).toBeVisible();
  await expect(page.getByRole("columnheader").allTextContents()).resolves.toEqual([
    "Number",
    "Client",
    "Issued",
    "Due",
    "Status",
    "Made in",
    "Amount",
  ]);
  await expect(page.getByText("Opened 3×", { exact: true })).toBeVisible();
  await expect(page.getByText("Part paid", { exact: true })).toBeVisible();
  await expect(page.getByText("9 days ago", { exact: true })).toBeVisible();
  await expect(page.getByText("Claude", { exact: true })).toBeVisible();
  await expect(page.getByText("Nota chat", { exact: true })).toBeVisible();
  const table = page.getByRole("table");
  await expect(table).toBeVisible();
  const desktopTableWidths = await table.evaluate((element) => ({
    client: element.parentElement?.clientWidth ?? 0,
    scroll: element.parentElement?.scrollWidth ?? 0,
  }));
  expect(desktopTableWidths.scroll - desktopTableWidths.client).toBeLessThanOrEqual(1);
  const amountHeaderBox = await page.getByRole("columnheader", { name: "Amount" }).boundingBox();
  expect(amountHeaderBox && amountHeaderBox.x + amountHeaderBox.width <= 1280).toBe(true);

  const statusNav = page.getByRole("navigation", { name: "Invoice status" });
  await statusNav.getByRole("link", { name: "Open 2" }).click();
  await expect(page).toHaveURL(/status=open/);
  await expect(page.getByTestId("invoice-list-row")).toHaveCount(2);

  await page.getByLabel("Find").fill("€4,800.00");
  await page.getByLabel("Find").press("Enter");
  await expect(page.getByTestId("invoice-list-row")).toHaveCount(1);
  await expect(page.getByText("LIST-PART", { exact: true })).toBeVisible();

  await page.goto("/invoices");
  const row = page.getByTestId("invoice-list-row").filter({ hasText: "LIST-DRAFT" });
  await row.getByRole("link", { name: "Download LIST-DRAFT PDF" }).click({ trial: true });
  await row.getByRole("button", { name: "More actions for LIST-DRAFT" }).click();
  await expect(page.getByRole("menuitem", { name: "Duplicate as draft" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Mark as sent" }).click();
  await expect(page.getByRole("heading", { name: "Mark this invoice as sent?" })).toBeVisible();
  await expect(page.getByText("without emailing the client")).toBeVisible();
  await page.getByRole("button", { name: "Mark as sent" }).click();
  await expect(row.getByText("Sent", { exact: true })).toBeVisible();

  await page.setViewportSize({ height: 844, width: 390 });
  const paidFilter = statusNav.getByRole("link", { name: "Paid 1" });
  await expect(paidFilter).toBeVisible();
  const paidFilterBox = await paidFilter.boundingBox();
  expect(paidFilterBox && paidFilterBox.x + paidFilterBox.width <= 390).toBe(true);
  expect(
    await table.evaluate((element) => {
      const container = element.parentElement;
      return Boolean(container && container.scrollWidth > container.clientWidth);
    }),
  ).toBe(true);
  const pageScroll = await page.evaluate(() => {
    window.scrollTo({ left: 1000, top: 0 });
    return { bodyWidth: document.body.scrollWidth, viewport: innerWidth, x: window.scrollX };
  });
  expect(pageScroll).toEqual({ bodyWidth: 390, viewport: 390, x: 0 });
});

function dateFromToday(offset: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function invoice(
  context: { clientId: string; orgId: string; userId: string },
  number: string,
  total: string,
  issuedAt: string,
  dueAt: string,
  status: "draft" | "overdue" | "paid" | "sent",
  source: "api" | "chat" | "cli" | "mcp" | "web",
  sourceClient?: string,
) {
  return {
    ...context,
    currency: "EUR",
    dueAt,
    issuedAt,
    number,
    source,
    sourceClient,
    status,
    subtotal: total,
    taxAmount: "0.00",
    taxRate: "0.00",
    total,
  };
}
