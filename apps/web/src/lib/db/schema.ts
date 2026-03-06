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
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const orgRoleEnum = pgEnum("org_role", ["owner", "admin", "member"]);

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

export const orgs = pgTable("orgs", {
  businessAddress: text("business_address"),
  businessName: text("business_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  defaultCurrency: text("default_currency").notNull().default("EUR"),
  id: uuid().defaultRandom().primaryKey(),
  invoiceDigits: integer("invoice_digits").notNull().default(4),
  invoicePrefix: text("invoice_prefix").notNull().default("INV"),
  invoiceSeparator: text("invoice_separator").notNull().default("-"),
  logoUrl: text("logo_url"),
  name: text().notNull(),
  nextInvoiceNumber: integer("next_invoice_number").notNull().default(1),
  stripeCustomerId: text("stripe_customer_id"),
  vatNumber: text("vat_number"),
});

export const orgMembers = pgTable(
  "org_members",
  {
    createdAt: timestamp("created_at").defaultNow().notNull(),
    id: uuid().defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    role: orgRoleEnum().notNull().default("member"),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [unique("org_members_org_id_user_id_unique").on(table.orgId, table.userId)],
);

export const invites = pgTable(
  "invites",
  {
    acceptedAt: timestamp("accepted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    email: text().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    id: uuid().defaultRandom().primaryKey(),
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    role: orgRoleEnum().notNull().default("member"),
    token: text().notNull().unique(),
  },
  (table) => [unique("invites_org_id_email_unique").on(table.orgId, table.email)],
);

export const bankAccounts = pgTable("bank_accounts", {
  createdAt: timestamp("created_at").defaultNow().notNull(),
  details: text().notNull(),
  id: uuid().defaultRandom().primaryKey(),
  isDefault: boolean("is_default").notNull().default(false),
  name: text().notNull(),
  orgId: uuid("org_id").references(() => orgs.id),
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
  orgId: uuid("org_id").references(() => orgs.id),
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

export const jobStatusEnum = pgEnum("job_status", ["pending", "processing", "completed", "dead"]);
export const jobTypeEnum = pgEnum("job_type", [
  "send_invoice_email",
  "send_invoice_reminder_email",
  "send_payment_received_email",
]);

export const invoices = pgTable(
  "invoices",
  {
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
    number: text().notNull(),
    orgId: uuid("org_id").references(() => orgs.id),
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
  },
  (table) => [unique("invoices_org_id_number_unique").on(table.orgId, table.number)],
);

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

export const jobs = pgTable("jobs", {
  attempts: integer().notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  id: uuid().defaultRandom().primaryKey(),
  invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "cascade" }),
  lastError: text("last_error"),
  lockedAt: timestamp("locked_at"),
  maxAttempts: integer("max_attempts").notNull().default(5),
  payload: jsonb().$type<Record<string, unknown>>().notNull(),
  runAt: timestamp("run_at").defaultNow().notNull(),
  status: jobStatusEnum().notNull().default("pending"),
  type: jobTypeEnum().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Relations

export const usersRelations = relations(users, ({ many }) => ({
  bankAccounts: many(bankAccounts),
  clients: many(clients),
  invites: many(invites),
  invoices: many(invoices),
  orgMembers: many(orgMembers),
}));

export const orgsRelations = relations(orgs, ({ many }) => ({
  bankAccounts: many(bankAccounts),
  clients: many(clients),
  invites: many(invites),
  invoices: many(invoices),
  orgMembers: many(orgMembers),
}));

export const orgMembersRelations = relations(orgMembers, ({ one }) => ({
  org: one(orgs, { fields: [orgMembers.orgId], references: [orgs.id] }),
  user: one(users, { fields: [orgMembers.userId], references: [users.id] }),
}));

export const invitesRelations = relations(invites, ({ one }) => ({
  invitedByUser: one(users, { fields: [invites.invitedBy], references: [users.id] }),
  org: one(orgs, { fields: [invites.orgId], references: [orgs.id] }),
}));

export const bankAccountsRelations = relations(bankAccounts, ({ one }) => ({
  org: one(orgs, { fields: [bankAccounts.orgId], references: [orgs.id] }),
  user: one(users, { fields: [bankAccounts.userId], references: [users.id] }),
}));

export const clientsRelations = relations(clients, ({ many, one }) => ({
  bankAccount: one(bankAccounts, {
    fields: [clients.bankAccountId],
    references: [bankAccounts.id],
  }),
  invoices: many(invoices),
  org: one(orgs, { fields: [clients.orgId], references: [orgs.id] }),
  user: one(users, { fields: [clients.userId], references: [users.id] }),
}));

export const invoicesRelations = relations(invoices, ({ many, one }) => ({
  activityLog: many(activityLog),
  client: one(clients, {
    fields: [invoices.clientId],
    references: [clients.id],
  }),
  jobs: many(jobs),
  lineItems: many(lineItems),
  org: one(orgs, { fields: [invoices.orgId], references: [orgs.id] }),
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

export const jobsRelations = relations(jobs, ({ one }) => ({
  invoice: one(invoices, {
    fields: [jobs.invoiceId],
    references: [invoices.id],
  }),
}));
