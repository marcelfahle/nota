import {
  date,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid().defaultRandom().primaryKey(),
  email: text().notNull().unique(),
  name: text().notNull(),
  passwordHash: text("password_hash").notNull(),
  businessName: text("business_name"),
  businessAddress: text("business_address"),
  vatNumber: text("vat_number"),
  bankDetails: text("bank_details"),
  logoUrl: text("logo_url"),
  defaultCurrency: text("default_currency").default("EUR"),
  invoicePrefix: text("invoice_prefix").default("INV"),
  nextInvoiceNumber: integer("next_invoice_number").default(1),
  createdAt: timestamp("created_at").defaultNow(),
});

export const clients = pgTable("clients", {
  id: uuid().defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  name: text().notNull(),
  email: text().notNull(),
  company: text(),
  address: text(),
  vatNumber: text("vat_number"),
  notes: text(),
  defaultCurrency: text("default_currency").default("EUR"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "sent",
  "paid",
  "overdue",
  "cancelled",
]);

export const invoices = pgTable("invoices", {
  id: uuid().defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id),
  number: text().notNull().unique(),
  status: invoiceStatusEnum().default("draft"),
  currency: text().default("EUR"),
  issuedAt: date("issued_at").notNull(),
  dueAt: date("due_at").notNull(),
  paidAt: date("paid_at"),
  sentAt: timestamp("sent_at"),
  subtotal: numeric({ precision: 12, scale: 2 }),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }),
  taxAmount: numeric("tax_amount", { precision: 12, scale: 2 }),
  total: numeric({ precision: 12, scale: 2 }),
  stripePaymentLinkId: text("stripe_payment_link_id"),
  stripePaymentLinkUrl: text("stripe_payment_link_url"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  notes: text(),
  internalNotes: text("internal_notes"),
  reverseCharge: text("reverse_charge").default("false"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const lineItems = pgTable("line_items", {
  id: uuid().defaultRandom().primaryKey(),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  description: text().notNull(),
  quantity: numeric({ precision: 10, scale: 2 }).notNull(),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  amount: numeric({ precision: 12, scale: 2 }).notNull(),
  sortOrder: integer("sort_order").default(0),
});
