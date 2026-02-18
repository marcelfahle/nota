import {
  integer,
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
