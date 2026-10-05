/* eslint-disable no-console */
import { createHash, randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";

import { eq } from "drizzle-orm";

import { db } from "../src/lib/db";
import {
  accounts,
  activityLog,
  apiKeys,
  bankAccounts,
  clients,
  invoices,
  lineItems,
  orgMembers,
  orgs,
  users,
} from "../src/lib/db/schema";

const scryptAsync = promisify(scrypt);
const databaseUrl = process.env.DATABASE_URL;
if (process.env.SEED_CONFIRM !== "disposable") {
  throw new Error("Refusing to seed: set SEED_CONFIRM=disposable for a throwaway database");
}
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const email = process.env.SEED_EMAIL || "admin@nota.test";
const name = process.env.SEED_NAME || "Nota Demo Admin";
const password = process.env.SEED_PASSWORD || "nota-demo-password";
const apiKey = process.env.SEED_API_KEY || "nota_seed_disposable_only";

async function hashPassword(value: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await scryptAsync(value, salt, 64)) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}

const [existingUser] = await db
  .select({ id: users.id })
  .from(users)
  .where(eq(users.email, email))
  .limit(1);
if (existingUser) {
  throw new Error(
    `Refusing to overwrite existing account ${email}; use a fresh disposable database`,
  );
}

const passwordHash = await hashPassword(password);
const seeded = await db.transaction(async (tx) => {
  const [user] = await tx
    .insert(users)
    .values({ email, emailVerified: true, name, passwordHash })
    .returning({ id: users.id });
  const [org] = await tx
    .insert(orgs)
    .values({
      businessAddress: "Carrer de la Nota 52, 08001 Barcelona, Spain",
      businessName: "Nota Demo Studio",
      contactEmail: email,
      legalName: "No Rules Software SL",
      name: "Nota Demo Studio",
      nextInvoiceNumber: 4,
      plan: "free",
      vatNumber: "ESB00000000",
    })
    .returning({ id: orgs.id });
  await tx.insert(accounts).values({
    accountId: user.id,
    password: passwordHash,
    providerId: "credential",
    userId: user.id,
  });
  await tx.insert(orgMembers).values({ orgId: org.id, role: "owner", userId: user.id });
  const [bank] = await tx
    .insert(bankAccounts)
    .values({
      accountType: "iban",
      bic: "NOTAESMMXXX",
      details: "IBAN ES00 0000 0000 0000 0000 0000 · BIC NOTAESMMXXX",
      iban: "ES0000000000000000000000",
      isDefault: true,
      name: "Demo EUR account",
      orgId: org.id,
      userId: user.id,
    })
    .returning({ id: bankAccounts.id });
  const createdClients = await tx
    .insert(clients)
    .values([
      {
        address: "1 Example Road, London, EC1A 1AA, United Kingdom",
        bankAccountId: bank.id,
        company: "Acme Design Ltd",
        email: "billing@acme.test",
        name: "Alice Example",
        orgId: org.id,
        userId: user.id,
      },
      {
        address: "Musterstraße 10, 10115 Berlin, Germany",
        bankAccountId: bank.id,
        company: "Example GmbH",
        email: "accounts@example.test",
        name: "Erika Muster",
        orgId: org.id,
        userId: user.id,
      },
    ])
    .returning({ id: clients.id });
  const createdInvoices = await tx
    .insert(invoices)
    .values([
      {
        clientId: createdClients[0].id,
        currency: "EUR",
        dueAt: "2026-11-15",
        issuedAt: "2026-10-05",
        notes: "Thank you for your business.",
        number: "INV-0001",
        orgId: org.id,
        status: "draft",
        subtotal: "2400.00",
        taxAmount: "504.00",
        taxRate: "21.00",
        total: "2904.00",
        userId: user.id,
      },
      {
        clientId: createdClients[1].id,
        currency: "EUR",
        dueAt: "2026-09-30",
        issuedAt: "2026-09-01",
        number: "INV-0002",
        orgId: org.id,
        publicToken: "seed-overdue-invoice",
        sentAt: new Date("2026-09-01T09:00:00Z"),
        status: "overdue",
        subtotal: "800.00",
        taxAmount: "0.00",
        taxRate: "0.00",
        total: "800.00",
        userId: user.id,
      },
      {
        clientId: createdClients[0].id,
        currency: "EUR",
        dueAt: "2026-08-31",
        issuedAt: "2026-08-01",
        number: "INV-0003",
        orgId: org.id,
        paidAt: "2026-08-20",
        publicToken: "seed-paid-invoice",
        sentAt: new Date("2026-08-01T09:00:00Z"),
        status: "paid",
        subtotal: "1200.00",
        taxAmount: "252.00",
        taxRate: "21.00",
        total: "1452.00",
        userId: user.id,
      },
    ])
    .returning({ id: invoices.id });
  await tx.insert(lineItems).values([
    {
      amount: "2400.00",
      description: "Product design sprint",
      invoiceId: createdInvoices[0].id,
      quantity: "4.00",
      unitPrice: "600.00",
    },
    {
      amount: "800.00",
      description: "Accessibility review",
      invoiceId: createdInvoices[1].id,
      quantity: "1.00",
      unitPrice: "800.00",
    },
    {
      amount: "1200.00",
      description: "Implementation support",
      invoiceId: createdInvoices[2].id,
      quantity: "2.00",
      unitPrice: "600.00",
    },
  ]);
  await tx.insert(activityLog).values([
    { action: "sent", invoiceId: createdInvoices[1].id, source: "system" },
    { action: "sent", invoiceId: createdInvoices[2].id, source: "system" },
    { action: "paid", invoiceId: createdInvoices[2].id, source: "system" },
  ]);
  await tx.insert(apiKeys).values({
    keyHash: createHash("sha256").update(apiKey).digest("hex"),
    keyPrefix: apiKey.slice(0, 8),
    name: "Disposable seed CLI",
    orgId: org.id,
    userId: user.id,
  });
  return { invoice: createdInvoices[0].id, org: org.id, user: user.id };
});

console.log(`Seeded disposable login: ${email}`);
console.log(`Seeded user: ${seeded.user}`);
console.log(`Seeded workspace: ${seeded.org}`);
console.log(`Seeded draft invoice: ${seeded.invoice}`);
