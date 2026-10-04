import { expect, test } from "@playwright/test";
import { and, eq } from "drizzle-orm";

import { db } from "../../src/lib/db";
import {
  activityLog,
  bankAccounts,
  clients,
  invoices,
  orgMembers,
  orgs,
  payments,
  users,
} from "../../src/lib/db/schema";
import { createClient, createDraftInvoice, registerAccount, uniqueSuffix } from "./helpers";

test("a client can view, pay and download a branded invoice without signing in", async ({
  browser,
  page,
}) => {
  const account = await registerAccount(page, "Public Invoice Studio");
  const suffix = uniqueSuffix();
  const clientName = await createClient(page, suffix);
  const draft = await createDraftInvoice(page, clientName, "Annual video platform", "500");
  const invoiceId = draft.invoicePath.split("/").at(-1);
  if (!invoiceId) {
    throw new Error("Expected an invoice ID");
  }

  const [context] = await db
    .select({ clientId: clients.id, orgId: orgMembers.orgId, userId: users.id })
    .from(users)
    .innerJoin(orgMembers, eq(orgMembers.userId, users.id))
    .innerJoin(clients, and(eq(clients.orgId, orgMembers.orgId), eq(clients.name, clientName)))
    .where(eq(users.email, account.email))
    .limit(1);
  if (!context) {
    throw new Error("Expected the registered account context");
  }

  const [bankAccount] = await db
    .insert(bankAccounts)
    .values({
      accountType: "iban",
      bic: "NTSBDEB1XXX",
      details: "Nota Test Bank\nAccount holder: Public Invoice Studio",
      iban: "DE89370400440532013000",
      isDefault: true,
      name: "Business account",
      orgId: context.orgId,
      userId: context.userId,
    })
    .returning({ id: bankAccounts.id });
  const token = `public-${suffix}`;
  await Promise.all([
    db
      .update(orgs)
      .set({
        brandColor: "#86efac",
        businessName: "Public Invoice Studio",
        city: "Dénia",
        country: "Spain",
        street: "Carrer de la Mar 4",
        website: "https://public-invoice.example",
      })
      .where(eq(orgs.id, context.orgId)),
    db
      .update(clients)
      .set({
        address: "Alexanderplatz 1\n10178 Berlin\nGermany",
        bankAccountId: bankAccount.id,
        company: "Accounts payable",
        name: "Oxide GmbH",
      })
      .where(eq(clients.id, context.clientId)),
    db
      .update(invoices)
      .set({
        publicToken: token,
        sentAt: new Date(),
        status: "sent",
        stripePaymentLinkUrl: "https://buy.stripe.com/test_public_invoice",
      })
      .where(eq(invoices.id, invoiceId)),
    db.insert(payments).values({
      amount: "125.00",
      currency: "EUR",
      invoiceId,
      method: "bank_transfer",
      orgId: context.orgId,
      receivedAt: new Date("2026-10-03T12:00:00Z"),
      source: "web",
    }),
  ]);

  const publicContext = await browser.newContext({
    baseURL: new URL(page.url()).origin,
    viewport: { height: 844, width: 390 },
  });
  const publicPage = await publicContext.newPage();
  await publicPage.goto(`/i/${token}`);

  await expect(publicPage).toHaveTitle("Invoice — Nota");
  await expect(publicPage.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex, nofollow/,
  );
  await expect(publicPage.getByRole("heading", { level: 1, name: "Invoice" })).toBeVisible();
  await expect(
    publicPage.getByText("Public Invoice Studio", { exact: true }).first(),
  ).toBeVisible();
  await expect(publicPage.getByText("Oxide GmbH")).toBeVisible();
  await expect(publicPage.getByText("€125.00", { exact: true })).toBeVisible();
  await expect(publicPage.getByText("€375.00", { exact: true }).first()).toBeVisible();
  await expect(publicPage.getByRole("link", { name: "Pay €375.00" })).toHaveAttribute(
    "href",
    "https://buy.stripe.com/test_public_invoice",
  );
  await expect(publicPage.getByText("DE89370400440532013000")).toBeVisible();
  await expect(publicPage.getByRole("link", { name: "Download PDF" })).toHaveAttribute(
    "href",
    `/api/public/invoices/${token}/pdf`,
  );
  await expect(publicPage.getByText("Sent with Nota.")).toBeVisible();
  await expect(publicPage.getByRole("navigation")).toHaveCount(0);
  expect(await publicPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );

  await publicPage.reload();
  const views = await db
    .select()
    .from(activityLog)
    .where(and(eq(activityLog.invoiceId, invoiceId), eq(activityLog.action, "viewed")));
  expect(views).toHaveLength(1);

  const pdf = await publicPage.request.get(`/api/public/invoices/${token}/pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect(pdf.headers()["content-disposition"]).toContain("attachment");

  await db.insert(payments).values({
    amount: "375.00",
    currency: "EUR",
    invoiceId,
    method: "stripe",
    orgId: context.orgId,
    receivedAt: new Date("2026-10-04T12:00:00Z"),
    source: "system",
  });
  await publicPage.reload();
  await expect(publicPage.getByText("Paid", { exact: true })).toBeVisible();
  await expect(publicPage.getByRole("link", { name: /^Pay / })).toHaveCount(0);

  await publicContext.close();
});
