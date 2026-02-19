import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  businessAddress: text("business_address"),
  businessName: text("business_name"),
  createdAt: timestamp("created_at").defaultNow(),
  defaultCurrency: text("default_currency").default("EUR"),
  email: text().notNull().unique(),
  id: uuid().defaultRandom().primaryKey(),
  invoiceDigits: integer("invoice_digits").notNull().default(4),
  invoicePrefix: text("invoice_prefix").default("INV"),
  invoiceSeparator: text("invoice_separator").notNull().default("-"),
  logoUrl: text("logo_url"),
  name: text().notNull(),
  nextInvoiceNumber: integer("next_invoice_number").default(1),
  passwordHash: text("password_hash").notNull(),
  vatNumber: text("vat_number"),
});

export const bankAccounts = pgTable("bank_accounts", {
  createdAt: timestamp("created_at").defaultNow().notNull(),
  details: text().notNull(),
  id: uuid().defaultRandom().primaryKey(),
  isDefault: boolean("is_default").notNull().default(false),
  name: text().notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
});

export const clients = pgTable("clients", {
  address: text(),
  bankAccountId: uuid("bank_account_id").references(() => bankAccounts.id, {
    onDelete: "set null",
  }),
  company: text(),
  createdAt: timestamp("created_at").defaultNow(),
  defaultCurrency: text("default_currency").default("EUR"),
  email: text().notNull(),
  id: uuid().defaultRandom().primaryKey(),
  name: text().notNull(),
  notes: text(),
  updatedAt: timestamp("updated_at").defaultNow(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  vatNumber: text("vat_number"),
});

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "sent",
  "paid",
  "overdue",
  "cancelled",
]);

export const invoices = pgTable("invoices", {
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id),
  createdAt: timestamp("created_at").defaultNow(),
  currency: text().default("EUR"),
  dueAt: date("due_at").notNull(),
  id: uuid().defaultRandom().primaryKey(),
  internalNotes: text("internal_notes"),
  issuedAt: date("issued_at").notNull(),
  notes: text(),
  number: text().notNull().unique(),
  paidAt: date("paid_at"),
  reverseCharge: text("reverse_charge").default("false"),
  sentAt: timestamp("sent_at"),
  status: invoiceStatusEnum().default("draft"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripePaymentLinkId: text("stripe_payment_link_id"),
  stripePaymentLinkUrl: text("stripe_payment_link_url"),
  subtotal: numeric({ precision: 12, scale: 2 }),
  taxAmount: numeric("tax_amount", { precision: 12, scale: 2 }),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }),
  total: numeric({ precision: 12, scale: 2 }),
  updatedAt: timestamp("updated_at").defaultNow(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
});

export const lineItems = pgTable("line_items", {
  amount: numeric({ precision: 12, scale: 2 }).notNull(),
  description: text().notNull(),
  id: uuid().defaultRandom().primaryKey(),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  quantity: numeric({ precision: 10, scale: 2 }).notNull(),
  sortOrder: integer("sort_order").default(0),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
});

export const activityLog = pgTable("activity_log", {
  action: text().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  id: uuid().defaultRandom().primaryKey(),
  invoiceId: uuid("invoice_id").references(() => invoices.id),
  metadata: jsonb(),
});

// Relations

export const usersRelations = relations(users, ({ many }) => ({
  bankAccounts: many(bankAccounts),
  clients: many(clients),
  invoices: many(invoices),
}));

export const bankAccountsRelations = relations(bankAccounts, ({ one }) => ({
  user: one(users, { fields: [bankAccounts.userId], references: [users.id] }),
}));

export const clientsRelations = relations(clients, ({ many, one }) => ({
  bankAccount: one(bankAccounts, {
    fields: [clients.bankAccountId],
    references: [bankAccounts.id],
  }),
  invoices: many(invoices),
  user: one(users, { fields: [clients.userId], references: [users.id] }),
}));

export const invoicesRelations = relations(invoices, ({ many, one }) => ({
  activityLog: many(activityLog),
  client: one(clients, {
    fields: [invoices.clientId],
    references: [clients.id],
  }),
  lineItems: many(lineItems),
  user: one(users, { fields: [invoices.userId], references: [users.id] }),
}));

export const lineItemsRelations = relations(lineItems, ({ one }) => ({
  invoice: one(invoices, {
    fields: [lineItems.invoiceId],
    references: [invoices.id],
  }),
}));

export const activityLogRelations = relations(activityLog, ({ one }) => ({
  invoice: one(invoices, {
    fields: [activityLog.invoiceId],
    references: [invoices.id],
  }),
}));
