import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  date,
  integer,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { SiteProfile } from "@/lib/site-reader/types";

export const orgRoleEnum = pgEnum("org_role", ["owner", "admin", "member"]);
export const invoiceKindEnum = pgEnum("invoice_kind", ["invoice", "credit_note"]);
export const invoiceSourceEnum = pgEnum("invoice_source", [
  "web",
  "chat",
  "mcp",
  "api",
  "cli",
  "system",
]);
export const paymentMethodEnum = pgEnum("payment_method", ["stripe", "bank_transfer", "other"]);
export const proposalKindEnum = pgEnum("proposal_kind", [
  "send_invoice",
  "send_reminder",
  "resend_with_bank_details",
]);
export const proposalStatusEnum = pgEnum("proposal_status", [
  "pending",
  "approved",
  "dismissed",
  "expired",
  "executed",
]);
export const vatStatusEnum = pgEnum("vat_status", ["valid", "invalid", "unavailable"]);

export const users = pgTable(
  "users",
  {
    businessAddress: text("business_address"),
    businessName: text("business_name"),
    createdAt: timestamp("created_at").defaultNow(),
    defaultCurrency: text("default_currency").default("EUR"),
    email: text().notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    id: uuid().defaultRandom().primaryKey(),
    image: text(),
    invoiceDigits: integer("invoice_digits").notNull().default(4),
    invoicePrefix: text("invoice_prefix").default("INV"),
    invoiceSeparator: text("invoice_separator").notNull().default("-"),
    isSuperAdmin: boolean("is_super_admin").notNull().default(false),
    logoUrl: text("logo_url"),
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    name: text().notNull(),
    nextInvoiceNumber: integer("next_invoice_number").default(1),
    // Legacy: passwords live in accounts.password now. Kept nullable for rollback.
    passwordHash: text("password_hash"),
    theme: text("theme", { enum: ["system", "light", "dark"] })
      .notNull()
      .default("system"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    vatNumber: text("vat_number"),
  },
  (table) => [
    uniqueIndex("users_one_super_admin_unique")
      .on(table.isSuperAdmin)
      .where(sql`${table.isSuperAdmin} = true`),
  ],
);

export const orgs = pgTable("orgs", {
  brandColor: text("brand_color"),
  businessAddress: text("business_address"),
  businessName: text("business_name"),
  city: text(),
  contactEmail: text("contact_email"),
  country: text(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  creditNotePrefix: text("credit_note_prefix").notNull().default("CN"),
  // Set by an operator to lock the workspace without deleting anything.
  deactivatedAt: timestamp("deactivated_at"),
  defaultCurrency: text("default_currency").notNull().default("EUR"),
  faviconUrl: text("favicon_url"),
  firstRunCompletedAt: timestamp("first_run_completed_at").defaultNow(),
  id: uuid().defaultRandom().primaryKey(),
  invoiceDigits: integer("invoice_digits").notNull().default(4),
  invoiceLayout: text("invoice_layout").notNull().default("classic"),
  invoicePrefix: text("invoice_prefix").notNull().default("INV"),
  invoiceSeparator: text("invoice_separator").notNull().default("-"),
  legalName: text("legal_name"),
  logoUrl: text("logo_url"),
  name: text().notNull(),
  nextCreditNoteNumber: integer("next_credit_note_number").notNull().default(1),
  nextInvoiceNumber: integer("next_invoice_number").notNull().default(1),
  plan: text("plan").notNull().default("free"),
  postalCode: text("postal_code"),
  profileSources: jsonb("profile_sources").$type<
    Record<
      string,
      {
        at: string;
        confirmed: boolean;
        detail?: string;
        source: "site" | "search" | "registry" | "user";
      }
    >
  >(),
  region: text(),
  street: text(),
  stripeAccountId: text("stripe_account_id").unique(),
  stripeChargesEnabled: boolean("stripe_charges_enabled").notNull().default(false),
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  stripeCustomerId: text("stripe_customer_id").unique(),
  stripePayoutsEnabled: boolean("stripe_payouts_enabled").notNull().default(false),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  stripeSubscriptionStatus: text("stripe_subscription_status"),
  vatNumber: text("vat_number"),
  vatRegistryAddress: text("vat_registry_address"),
  vatRegistryName: text("vat_registry_name"),
  vatStatus: vatStatusEnum("vat_status"),
  vatVerifiedAt: timestamp("vat_verified_at"),
  website: text(),
});

// Keep usage after invoice deletion; a cancelled invoice still used a send.
export const invoiceSends = pgTable(
  "invoice_sends",
  {
    invoiceId: uuid("invoice_id").primaryKey(),
    month: date("month").notNull(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
  },
  (table) => [index("invoice_sends_org_month_idx").on(table.orgId, table.month)],
);

export const stripeEvents = pgTable("stripe_events", {
  id: text().primaryKey(),
  processedAt: timestamp("processed_at").notNull().defaultNow(),
});

export const stripeConnectStates = pgTable("stripe_connect_states", {
  expiresAt: timestamp("expires_at").notNull(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => orgs.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
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

export const apiKeys = pgTable("api_keys", {
  createdAt: timestamp("created_at").defaultNow().notNull(),
  id: uuid().defaultRandom().primaryKey(),
  keyHash: text("key_hash").notNull().unique(),
  keyPrefix: text("key_prefix").notNull(),
  lastUsedAt: timestamp("last_used_at"),
  name: text().notNull(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => orgs.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
});

export const bankAccounts = pgTable("bank_accounts", {
  accountType: text("account_type").notNull().default("freeform"),
  bic: text("bic"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  details: text().notNull(),
  iban: text("iban"),
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
  vatRegistryAddress: text("vat_registry_address"),
  vatRegistryName: text("vat_registry_name"),
  vatStatus: vatStatusEnum("vat_status"),
  vatVerifiedAt: timestamp("vat_verified_at"),
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
  "send_invoice_test_email",
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
    creditsInvoiceId: uuid("credits_invoice_id").references((): AnyPgColumn => invoices.id),
    currency: text().default("EUR"),
    dueAt: date("due_at").notNull(),
    id: uuid().defaultRandom().primaryKey(),
    internalNotes: text("internal_notes"),
    issuedAt: date("issued_at").notNull(),
    kind: invoiceKindEnum().notNull().default("invoice"),
    notes: text(),
    number: text().notNull(),
    orgId: uuid("org_id").references(() => orgs.id),
    paidAt: date("paid_at"),
    publicToken: text("public_token").unique(),
    reverseCharge: text("reverse_charge").default("false"),
    revision: integer().notNull().default(1),
    sentAt: timestamp("sent_at"),
    source: invoiceSourceEnum().notNull().default("web"),
    sourceClient: text("source_client"),
    status: invoiceStatusEnum().default("draft"),
    stripeAccountId: text("stripe_account_id"),
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

export const activityLog = pgTable(
  "activity_log",
  {
    action: text().notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    id: uuid().defaultRandom().primaryKey(),
    invoiceId: uuid("invoice_id").references(() => invoices.id),
    metadata: jsonb(),
    source: invoiceSourceEnum().notNull().default("web"),
    sourceClient: text("source_client"),
  },
  (table) => [
    index("activity_log_invoice_action_created_idx").on(
      table.invoiceId,
      table.action,
      table.createdAt,
    ),
  ],
);

export const payments = pgTable(
  "payments",
  {
    amount: numeric({ precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    currency: text().notNull(),
    id: uuid().defaultRandom().primaryKey(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    method: paymentMethodEnum().notNull(),
    note: text(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    receivedAt: timestamp("received_at").notNull(),
    source: invoiceSourceEnum().notNull().default("web"),
    stripePaymentIntentId: text("stripe_payment_intent_id").unique(),
  },
  (table) => [index("payments_invoice_id_idx").on(table.invoiceId)],
);

export const vatChecks = pgTable("vat_checks", {
  address: text(),
  checkedAt: timestamp("checked_at").notNull(),
  name: text(),
  status: vatStatusEnum().notNull(),
  vatNumber: text("vat_number").primaryKey(),
});

// Pre-signup onboarding. Nothing here belongs to an account: a session is a
// preview that expires, and is copied into an org only at registration.
export const onboardingSessions = pgTable(
  "onboarding_sessions",
  {
    createdAt: timestamp("created_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
    id: uuid().defaultRandom().primaryKey(),
    profile: jsonb().$type<SiteProfile>(),
    tokenHash: text("token_hash").notNull().unique(),
  },
  (table) => [index("onboarding_sessions_expires_idx").on(table.expiresAt)],
);

// One read per domain per day, whoever asks.
export const siteReads = pgTable("site_reads", {
  domain: text().primaryKey(),
  profile: jsonb().$type<SiteProfile>().notNull(),
  readAt: timestamp("read_at").notNull(),
});

// Fixed-window counters for the public reader: per IP, global, daily spend.
export const readerUsage = pgTable(
  "reader_usage",
  {
    bucket: text().primaryKey(),
    count: integer().notNull().default(0),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => [index("reader_usage_expires_idx").on(table.expiresAt)],
);

export const aiUsage = pgTable(
  "ai_usage",
  {
    createdAt: timestamp("created_at").notNull().defaultNow(),
    feature: text().notNull(),
    id: uuid().defaultRandom().primaryKey(),
    inputTokens: integer("input_tokens").notNull().default(0),
    modelId: text("model_id").notNull(),
    orgId: uuid("org_id").references(() => orgs.id, { onDelete: "set null" }),
    outputTokens: integer("output_tokens").notNull().default(0),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => [
    index("ai_usage_created_at_idx").on(table.createdAt),
    index("ai_usage_org_created_at_idx").on(table.orgId, table.createdAt),
  ],
);

export const aiModelSettings = pgTable("ai_model_settings", {
  changedAt: timestamp("changed_at").notNull().defaultNow(),
  changedBy: uuid("changed_by")
    .notNull()
    .references(() => users.id),
  feature: text().primaryKey(),
  modelId: text("model_id").notNull(),
});

export const aiWorkspaceModelOverrides = pgTable(
  "ai_workspace_model_overrides",
  {
    changedAt: timestamp("changed_at").notNull().defaultNow(),
    changedBy: uuid("changed_by")
      .notNull()
      .references(() => users.id),
    feature: text().notNull(),
    id: uuid().defaultRandom().primaryKey(),
    modelId: text("model_id").notNull(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
  },
  (table) => [
    unique("ai_workspace_model_overrides_org_feature_unique").on(table.orgId, table.feature),
  ],
);

export const aiModelChanges = pgTable(
  "ai_model_changes",
  {
    changedAt: timestamp("changed_at").notNull().defaultNow(),
    changedBy: uuid("changed_by")
      .notNull()
      .references(() => users.id),
    feature: text().notNull(),
    id: uuid().defaultRandom().primaryKey(),
    modelId: text("model_id"),
    orgId: uuid("org_id").references(() => orgs.id, { onDelete: "cascade" }),
  },
  (table) => [index("ai_model_changes_changed_at_idx").on(table.changedAt)],
);

export const chatThreads = pgTable(
  "chat_threads",
  {
    createdAt: timestamp("created_at").defaultNow().notNull(),
    id: uuid().defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [index("chat_threads_org_user_idx").on(table.orgId, table.userId)],
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    createdAt: timestamp("created_at").defaultNow().notNull(),
    id: text().primaryKey(),
    pageContext: jsonb("page_context").$type<{ entityId?: string; route?: string }>(),
    parts: jsonb().$type<Array<unknown>>().notNull(),
    role: text().notNull(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => chatThreads.id, { onDelete: "cascade" }),
  },
  (table) => [index("chat_messages_thread_created_idx").on(table.threadId, table.createdAt)],
);

export const proposals = pgTable(
  "proposals",
  {
    createdAt: timestamp("created_at").defaultNow().notNull(),
    createdBy: text("created_by").notNull(),
    decidedAt: timestamp("decided_at"),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at"),
    id: uuid().defaultRandom().primaryKey(),
    invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "cascade" }),
    invoiceRevision: integer("invoice_revision"),
    kind: proposalKindEnum().notNull(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    reason: text().notNull(),
    sourceClient: text("source_client"),
    status: proposalStatusEnum().notNull().default("pending"),
  },
  (table) => [
    uniqueIndex("proposals_pending_invoice_kind_unique")
      .on(table.invoiceId, table.kind)
      .where(sql`${table.status} = 'pending'`),
  ],
);

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
  apiKeys: many(apiKeys),
  bankAccounts: many(bankAccounts),
  clients: many(clients),
  invites: many(invites),
  invoices: many(invoices),
  orgMembers: many(orgMembers),
}));

export const orgsRelations = relations(orgs, ({ many }) => ({
  apiKeys: many(apiKeys),
  bankAccounts: many(bankAccounts),
  chatThreads: many(chatThreads),
  clients: many(clients),
  invites: many(invites),
  invoices: many(invoices),
  orgMembers: many(orgMembers),
  payments: many(payments),
  proposals: many(proposals),
}));

export const orgMembersRelations = relations(orgMembers, ({ one }) => ({
  org: one(orgs, { fields: [orgMembers.orgId], references: [orgs.id] }),
  user: one(users, { fields: [orgMembers.userId], references: [users.id] }),
}));

export const invitesRelations = relations(invites, ({ one }) => ({
  invitedByUser: one(users, { fields: [invites.invitedBy], references: [users.id] }),
  org: one(orgs, { fields: [invites.orgId], references: [orgs.id] }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  org: one(orgs, { fields: [apiKeys.orgId], references: [orgs.id] }),
  user: one(users, { fields: [apiKeys.userId], references: [users.id] }),
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
  payments: many(payments),
  proposals: many(proposals),
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

export const paymentsRelations = relations(payments, ({ one }) => ({
  invoice: one(invoices, { fields: [payments.invoiceId], references: [invoices.id] }),
  org: one(orgs, { fields: [payments.orgId], references: [orgs.id] }),
}));

export const chatThreadsRelations = relations(chatThreads, ({ many, one }) => ({
  messages: many(chatMessages),
  org: one(orgs, { fields: [chatThreads.orgId], references: [orgs.id] }),
  user: one(users, { fields: [chatThreads.userId], references: [users.id] }),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  thread: one(chatThreads, {
    fields: [chatMessages.threadId],
    references: [chatThreads.id],
  }),
}));

export const proposalsRelations = relations(proposals, ({ one }) => ({
  invoice: one(invoices, { fields: [proposals.invoiceId], references: [invoices.id] }),
  org: one(orgs, { fields: [proposals.orgId], references: [orgs.id] }),
}));

export const jobsRelations = relations(jobs, ({ one }) => ({
  invoice: one(invoices, {
    fields: [jobs.invoiceId],
    references: [invoices.id],
  }),
}));

// ── Better Auth: sessions, credentials, OAuth 2.1 provider for MCP ──
// Property names must match Better Auth's field names; columns stay snake_case.

export const sessions = pgTable("sessions", {
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  id: uuid().defaultRandom().primaryKey(),
  ipAddress: text("ip_address"),
  token: text().notNull().unique(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  userAgent: text("user_agent"),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
});

export const accounts = pgTable("accounts", {
  accessToken: text("access_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  accountId: text("account_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  id: uuid().defaultRandom().primaryKey(),
  idToken: text("id_token"),
  password: text(),
  providerId: text("provider_id").notNull(),
  refreshToken: text("refresh_token"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
});

export const verifications = pgTable("verifications", {
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  id: uuid().defaultRandom().primaryKey(),
  identifier: text().notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  value: text().notNull(),
});

export const jwks = pgTable("jwks", {
  alg: text(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  crv: text(),
  expiresAt: timestamp("expires_at"),
  id: uuid().defaultRandom().primaryKey(),
  privateKey: text("private_key").notNull(),
  publicKey: text("public_key").notNull(),
});

export const oauthClients = pgTable("oauth_clients", {
  applicationType: text("application_type"),
  backchannelLogoutSessionRequired: boolean("backchannel_logout_session_required"),
  backchannelLogoutUri: text("backchannel_logout_uri"),
  clientCredentialsScopes: text("client_credentials_scopes").array(),
  clientDiscoveryId: text("client_discovery_id"),
  clientId: text("client_id").notNull().unique(),
  clientSecret: text("client_secret"),
  contacts: text().array(),
  createdAt: timestamp("created_at").defaultNow(),
  disabled: boolean().default(false),
  dpopBoundAccessTokens: boolean("dpop_bound_access_tokens").default(false),
  enableEndSession: boolean("enable_end_session"),
  grantTypes: text("grant_types").array(),
  icon: text(),
  id: uuid().defaultRandom().primaryKey(),
  jwks: text(),
  jwksUri: text("jwks_uri"),
  metadata: jsonb(),
  name: text(),
  policy: text(),
  postLogoutRedirectUris: text("post_logout_redirect_uris").array(),
  redirectUris: text("redirect_uris").array().notNull(),
  referenceId: text("reference_id"),
  requirePKCE: boolean("require_pkce"),
  responseTypes: text("response_types").array(),
  scopes: text().array(),
  skipConsent: boolean("skip_consent"),
  softwareId: text("software_id"),
  softwareStatement: text("software_statement"),
  softwareVersion: text("software_version"),
  subjectType: text("subject_type"),
  tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
  tos: text(),
  updatedAt: timestamp("updated_at").defaultNow(),
  uri: text(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
});

export const oauthResources = pgTable("oauth_resources", {
  accessTokenTtl: integer("access_token_ttl"),
  allowedScopes: text("allowed_scopes").array(),
  createdAt: timestamp("created_at").defaultNow(),
  customClaims: jsonb("custom_claims"),
  disabled: boolean().default(false),
  dpopBoundAccessTokensRequired: boolean("dpop_bound_access_tokens_required").default(false),
  id: uuid().defaultRandom().primaryKey(),
  identifier: text().notNull().unique(),
  metadata: jsonb(),
  name: text().notNull(),
  policyVersion: integer("policy_version").default(1),
  refreshTokenTtl: integer("refresh_token_ttl"),
  signingAlgorithm: text("signing_algorithm"),
  signingKeyId: text("signing_key_id"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const oauthClientResources = pgTable("oauth_client_resources", {
  clientId: text("client_id")
    .notNull()
    .references(() => oauthClients.clientId, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
  id: uuid().defaultRandom().primaryKey(),
  metadata: jsonb(),
  resourceId: text("resource_id")
    .notNull()
    .references(() => oauthResources.identifier, { onDelete: "cascade" }),
});

export const oauthRefreshTokens = pgTable("oauth_refresh_tokens", {
  authorizationCodeId: text("authorization_code_id"),
  authTime: timestamp("auth_time"),
  clientId: text("client_id")
    .notNull()
    .references(() => oauthClients.clientId, { onDelete: "cascade" }),
  confirmation: jsonb(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  id: uuid().defaultRandom().primaryKey(),
  referenceId: text("reference_id"),
  requestedUserInfoClaims: text("requested_user_info_claims").array(),
  resources: text().array(),
  revoked: timestamp(),
  rotatedAt: timestamp("rotated_at"),
  rotationReplayExpiresAt: timestamp("rotation_replay_expires_at"),
  rotationReplayResponse: text("rotation_replay_response"),
  scopes: text().array().notNull(),
  sessionId: uuid("session_id").references(() => sessions.id, { onDelete: "set null" }),
  token: text().notNull().unique(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
});

export const oauthAccessTokens = pgTable("oauth_access_tokens", {
  authorizationCodeId: text("authorization_code_id"),
  clientId: text("client_id")
    .notNull()
    .references(() => oauthClients.clientId, { onDelete: "cascade" }),
  confirmation: jsonb(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  id: uuid().defaultRandom().primaryKey(),
  referenceId: text("reference_id"),
  refreshId: uuid("refresh_id").references(() => oauthRefreshTokens.id, { onDelete: "set null" }),
  requestedUserInfoClaims: text("requested_user_info_claims").array(),
  resources: text().array(),
  revoked: timestamp(),
  scopes: text().array().notNull(),
  sessionId: uuid("session_id").references(() => sessions.id, { onDelete: "set null" }),
  token: text().notNull().unique(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
});

export const oauthConsents = pgTable("oauth_consents", {
  clientId: text("client_id")
    .notNull()
    .references(() => oauthClients.clientId, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  id: uuid().defaultRandom().primaryKey(),
  referenceId: text("reference_id"),
  requestedUserInfoClaims: text("requested_user_info_claims").array(),
  resources: text().array(),
  scopes: text().array().notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
});

export const oauthClientAssertions = pgTable("oauth_client_assertions", {
  expiresAt: timestamp("expires_at").notNull(),
  id: text().primaryKey(),
});
