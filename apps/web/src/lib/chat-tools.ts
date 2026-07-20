import { tool } from "ai";
import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getInvoiceList } from "@/lib/api-invoices";
import type { AuthenticatedUserContext } from "@/lib/auth";
import {
  isChatInvoiceLineItemParseError,
  resolveChatInvoiceDates,
  resolveChatInvoiceLineItems,
} from "@/lib/chat-parser";
import { createInvoiceInsightTools } from "@/lib/chat-insight-tools";
import { db } from "@/lib/db";
import {
  clients,
  invoices,
  invoiceStatusEnum,
  lineItems as invoiceLineItems,
} from "@/lib/db/schema";
import {
  INVOICE_PERIOD_KEYS,
  type InvoicePeriod,
  type InvoicePeriodKey,
  resolveInvoicePeriod,
} from "@/lib/invoice-period";
import {
  cancelInvoice,
  createInvoice,
  deleteInvoice,
  duplicateInvoice,
  getInvoiceDetail,
  markInvoicePaid,
  sendInvoice,
  sendReminder,
  type InvoiceMutationInput,
} from "@/lib/invoice-service";

type ChatToolContext = Pick<AuthenticatedUserContext, "org" | "role" | "user">;

async function withRetry<T>(fn: () => Promise<T>, retries = 1): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) {
      throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
    return withRetry(fn, retries - 1);
  }
}

type InvoiceToolSummary = {
  clientName: string | null;
  currency: string | null;
  dueAt: string;
  id: string;
  issuedAt: string;
  number: string;
  status: string;
  total: string | null;
};

type InvoiceTemplate = {
  currency: string | null;
  internalNotes: string | null;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
  }>;
  notes: string | null;
  reverseCharge: string | null;
  taxRate: number | null;
};

type ClientSearchResult = Awaited<ReturnType<typeof listClientsForOrg>>[number];

const invoicePeriodSchema = z.enum(INVOICE_PERIOD_KEYS);
const invoiceStatusSchema = z.enum(invoiceStatusEnum.enumValues);
const MUTATION_RETRIES = 0;

type PeriodToolInput = {
  from?: string;
  period?: InvoicePeriodKey;
  to?: string;
};

function buildServiceContext(auth: ChatToolContext) {
  return {
    orgId: auth.org.id,
    role: auth.role,
    userId: auth.user.id,
  };
}

function toInvoiceSummary(
  invoice: NonNullable<Awaited<ReturnType<typeof getInvoiceDetail>>>,
): InvoiceToolSummary {
  return {
    clientName: invoice.client?.name ?? null,
    currency: invoice.currency,
    dueAt: invoice.dueAt,
    id: invoice.id,
    issuedAt: invoice.issuedAt,
    number: invoice.number,
    status: invoice.status ?? "draft",
    total: invoice.total,
  };
}

async function listClientsForOrg(orgId: string, search?: string, limit = 12) {
  return db
    .select({
      company: clients.company,
      defaultCurrency: clients.defaultCurrency,
      email: clients.email,
      id: clients.id,
      name: clients.name,
    })
    .from(clients)
    .where(
      and(
        eq(clients.orgId, orgId),
        search
          ? or(
              ilike(clients.company, `%${search}%`),
              ilike(clients.email, `%${search}%`),
              ilike(clients.name, `%${search}%`),
            )
          : undefined,
      ),
    )
    .orderBy(asc(clients.name))
    .limit(limit);
}

function normalizeSearchValue(value: string) {
  return value.trim().toLowerCase();
}

function scoreSearchField(
  value: string | null | undefined,
  normalizedQuery: string,
  scores: { exact: number; includes: number; startsWith: number },
) {
  if (!value) {
    return 0;
  }

  const normalizedValue = normalizeSearchValue(value);
  if (normalizedValue === normalizedQuery) {
    return scores.exact;
  }

  if (normalizedValue.startsWith(normalizedQuery)) {
    return scores.startsWith;
  }

  if (normalizedValue.includes(normalizedQuery)) {
    return scores.includes;
  }

  return 0;
}

function scoreClientMatch(client: ClientSearchResult, normalizedQuery: string) {
  return Math.max(
    scoreSearchField(client.name, normalizedQuery, {
      exact: 100,
      includes: 70,
      startsWith: 90,
    }),
    scoreSearchField(client.company, normalizedQuery, {
      exact: 80,
      includes: 50,
      startsWith: 60,
    }),
    scoreSearchField(client.email, normalizedQuery, {
      exact: 40,
      includes: 10,
      startsWith: 20,
    }),
  );
}

function isClientResolutionError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message === "Client not found" ||
    error.message.startsWith("Client name ") ||
    error.message.startsWith("No client matched ") ||
    error.message.startsWith("Provide either clientId or clientName")
  );
}

async function resolveClient(
  auth: ChatToolContext,
  input: { clientId?: string; clientName?: string },
) {
  if (input.clientId) {
    const [client] = await db
      .select({
        defaultCurrency: clients.defaultCurrency,
        email: clients.email,
        id: clients.id,
        name: clients.name,
      })
      .from(clients)
      .where(
        and(eq(clients.id, input.clientId), eq(clients.orgId, auth.org.id)),
      )
      .limit(1);

    if (!client) {
      throw new Error("Client not found");
    }

    return client;
  }

  if (!input.clientName?.trim()) {
    throw new Error("Provide either clientId or clientName.");
  }

  const matches = await listClientsForOrg(auth.org.id, input.clientName, 20);
  const normalizedQuery = normalizeSearchValue(input.clientName);
  const scoredMatches = matches
    .map((client) => ({
      client,
      score: scoreClientMatch(client, normalizedQuery),
    }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scoredMatches.length === 0) {
    throw new Error(`No client matched '${input.clientName}'.`);
  }

  const topScore = scoredMatches[0].score;
  const resolvedMatches = scoredMatches
    .filter((match) => match.score === topScore)
    .map((match) => match.client);

  if (resolvedMatches.length > 1) {
    throw new Error(
      `Client name '${input.clientName}' is ambiguous. Matches: ${resolvedMatches
        .map(
          (client) =>
            `${client.name}${client.company ? ` (${client.company})` : ""} [${client.id}]`,
        )
        .join(", ")}`,
    );
  }

  return resolvedMatches[0];
}

async function resolveInvoice(
  auth: ChatToolContext,
  input: { invoiceId?: string; invoiceNumber?: string },
) {
  if (input.invoiceId) {
    const invoice = await getInvoiceDetail(auth.org.id, input.invoiceId);
    if (!invoice) {
      throw new Error("Invoice not found");
    }

    return invoice;
  }

  if (!input.invoiceNumber?.trim()) {
    throw new Error("Provide either invoiceId or invoiceNumber.");
  }

  const [invoiceRecord] = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(
      and(
        eq(invoices.orgId, auth.org.id),
        eq(invoices.number, input.invoiceNumber.trim()),
      ),
    )
    .limit(1);

  if (!invoiceRecord) {
    throw new Error(`Invoice '${input.invoiceNumber}' not found.`);
  }

  const invoice = await getInvoiceDetail(auth.org.id, invoiceRecord.id);
  if (!invoice) {
    throw new Error("Invoice not found");
  }

  return invoice;
}

async function loadInvoiceSummary(auth: ChatToolContext, invoiceId: string) {
  const invoice = await getInvoiceDetail(auth.org.id, invoiceId);
  if (!invoice) {
    throw new Error("Invoice could not be loaded");
  }

  return invoice;
}

function normalizeDbNumber(value: string | null) {
  if (value === null) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function loadLatestInvoiceTemplate(
  auth: ChatToolContext,
  clientId: string,
): Promise<InvoiceTemplate | null> {
  const [invoice] = await db
    .select({
      currency: invoices.currency,
      id: invoices.id,
      internalNotes: invoices.internalNotes,
      notes: invoices.notes,
      reverseCharge: invoices.reverseCharge,
      taxRate: invoices.taxRate,
    })
    .from(invoices)
    .where(
      and(eq(invoices.orgId, auth.org.id), eq(invoices.clientId, clientId)),
    )
    .orderBy(desc(invoices.issuedAt), desc(invoices.createdAt))
    .limit(1);

  if (!invoice) {
    return null;
  }

  const items = await db
    .select({
      description: invoiceLineItems.description,
      quantity: invoiceLineItems.quantity,
      sortOrder: invoiceLineItems.sortOrder,
      unitPrice: invoiceLineItems.unitPrice,
    })
    .from(invoiceLineItems)
    .where(eq(invoiceLineItems.invoiceId, invoice.id))
    .orderBy(asc(invoiceLineItems.sortOrder));

  return {
    currency: invoice.currency,
    internalNotes: invoice.internalNotes,
    lineItems: items
      .map((item) => ({
        description: item.description,
        quantity: normalizeDbNumber(item.quantity),
        unitPrice: normalizeDbNumber(item.unitPrice),
      }))
      .filter(
        (
          item,
        ): item is {
          description: string;
          quantity: number;
          unitPrice: number;
        } => item.quantity !== null && item.unitPrice !== null,
      ),
    notes: invoice.notes,
    reverseCharge: invoice.reverseCharge,
    taxRate: normalizeDbNumber(invoice.taxRate),
  };
}

function getRequestedTotalAmount(input: {
  amount?: number;
  totalAmount?: number;
}) {
  return input.totalAmount ?? input.amount;
}

function resolveToolPeriod(input: PeriodToolInput, fallback: InvoicePeriodKey) {
  return resolveInvoicePeriod({
    from: input.from,
    period: input.period ?? (input.from || input.to ? "custom" : fallback),
    to: input.to,
  });
}

function revalidateClientViews() {
  revalidatePath("/");
  revalidatePath("/clients");
}

function revalidateInvoiceViews(invoiceId?: string) {
  revalidatePath("/");
  revalidatePath("/invoices");
  if (invoiceId) {
    revalidatePath(`/invoices/${invoiceId}`);
  }
}

export async function buildChatSystemContext(auth: ChatToolContext) {
  const [clientList, recentInvoices] = await Promise.all([
    listClientsForOrg(auth.org.id, undefined, 25),
    getInvoiceList(auth.org.id, { page: 1, perPage: 8 }),
  ]);

  return {
    clients: clientList,
    recentInvoices: recentInvoices.data,
  };
}

export function buildChatSystemPrompt(
  auth: ChatToolContext,
  context: Awaited<ReturnType<typeof buildChatSystemContext>>,
) {
  const clientSummary =
    context.clients.length > 0
      ? context.clients
          .map(
            (client) =>
              `${client.name}${client.company ? `, company ${client.company}` : ""} <${client.email}>`,
          )
          .join("; ")
      : "No clients yet.";

  const recentInvoiceSummary =
    context.recentInvoices.length > 0
      ? context.recentInvoices
          .map(
            (invoice) =>
              `${invoice.number} ${invoice.status} ${invoice.client?.name ?? "Unknown client"} ${invoice.total ?? "0.00"} ${invoice.currency ?? "EUR"}`,
          )
          .join("; ")
      : "No invoices yet.";

  return [
    "You are Nota, an internal invoicing copilot.",
    `Today's date is ${new Date().toISOString().slice(0, 10)}.`,
    `Workspace: ${auth.org.businessName ?? auth.org.name}.`,
    `User role: ${auth.role}. Respect permissions; if a tool fails, explain the failure plainly.`,
    `Default currency: ${auth.org.defaultCurrency ?? "EUR"}. Invoice prefix: ${auth.org.invoicePrefix ?? "INV"}.`,
    `Known clients: ${clientSummary}`,
    `Recent invoices: ${recentInvoiceSummary}`,
    "Use tools whenever the user asks for live data or wants to change data.",
    "Available invoice actions include creating drafts, listing, loading details, sending, reminding, duplicating, marking paid, cancelling, deleting draft or cancelled invoices, analyzing performance, explaining client history, and preparing ZIP downloads.",
    "For questions about revenue, collections, overdue exposure, trends, or top clients, use get_invoice_analytics. Keep currencies separate and distinguish issued, collected, outstanding, overdue, and draft value. Collected means payments received during the requested period; collection rate means the share of that period's issued value that is now paid.",
    "For questions about one customer, use get_client_insights. For requested invoice files, use download_invoice_archive and give the user its download link; do not claim the file downloaded automatically.",
    "When creating invoices, prefer the client name or company phrase the user literally said. If multiple clients might match, list clients before creating; do not silently switch to a contact/person name.",
    "When creating invoices from natural language, pass lineItemsText for described work, totalAmount for flat amounts like 'for 1000', invoiceMonth for periods like 'for May', and copyPreviousInvoice for phrases like 'same as last time' or 'another one like the last ones'.",
    "totalAmount means the desired invoice grand total. For invoiceMonth, use YYYY-MM when you can infer it from today's date.",
    "Be concise. After a successful mutation, confirm the result with the invoice number or client name.",
  ].join("\n");
}

/* eslint-disable perfectionist/sort-objects -- Keep related read tools next to the data they build on. */
export function createChatTools(auth: ChatToolContext) {
  return {
    cancel_invoice: tool({
      description: "Cancel a sent or overdue invoice.",
      execute: (input) =>
        withRetry(async () => {
          const invoice = await resolveInvoice(auth, input);
          const result = await cancelInvoice(
            buildServiceContext(auth),
            invoice.id,
          );
          if ("error" in result) {
            throw new Error(result.error);
          }

          const updatedInvoice = await loadInvoiceSummary(auth, invoice.id);
          revalidateInvoiceViews(updatedInvoice.id);

          return {
            invoice: toInvoiceSummary(updatedInvoice),
            kind: "invoice",
            message: `Cancelled invoice ${updatedInvoice.number}.`,
            warning: result.warning,
          };
        }, MUTATION_RETRIES),
      inputSchema: z.object({
        invoiceId: z.string().uuid().optional(),
        invoiceNumber: z.string().trim().optional(),
      }),
    }),
    create_client: tool({
      description: "Create a client in Nota.",
      execute: (input) =>
        withRetry(async () => {
          const [client] = await db
            .insert(clients)
            .values({
              address: input.address,
              company: input.company,
              defaultCurrency:
                input.defaultCurrency ?? auth.org.defaultCurrency ?? "EUR",
              email: input.email.trim().toLowerCase(),
              name: input.name.trim(),
              notes: input.notes,
              orgId: auth.org.id,
              userId: auth.user.id,
              vatNumber: input.vatNumber,
            })
            .returning({
              company: clients.company,
              email: clients.email,
              id: clients.id,
              name: clients.name,
            });

          revalidateClientViews();

          return {
            client,
            kind: "client",
            message: `Created client ${client.name}.`,
          };
        }, MUTATION_RETRIES),
      inputSchema: z.object({
        address: z.string().trim().optional(),
        company: z.string().trim().optional(),
        defaultCurrency: z.string().trim().optional(),
        email: z.string().email(),
        name: z.string().trim().min(1),
        notes: z.string().trim().optional(),
        vatNumber: z.string().trim().optional(),
      }),
    }),
    create_invoice: tool({
      description: "Create a draft invoice for a client.",
      execute: (input) =>
        withRetry(async () => {
          let client: Awaited<ReturnType<typeof resolveClient>>;
          try {
            client = await resolveClient(auth, input);
          } catch (error) {
            if (isClientResolutionError(error)) {
              return {
                kind: "needs-input",
                message:
                  error instanceof Error
                    ? error.message
                    : "I need a client before I can create that invoice.",
              };
            }

            throw error;
          }

          const latestInvoiceTemplate = await loadLatestInvoiceTemplate(
            auth,
            client.id,
          );
          const requestedTotalAmount = getRequestedTotalAmount(input);
          const useTemplateDefaults = Boolean(
            input.copyPreviousInvoice || requestedTotalAmount,
          );
          const taxRate =
            input.taxRate ??
            (useTemplateDefaults ? latestInvoiceTemplate?.taxRate : null) ??
            0;
          const dates = resolveChatInvoiceDates({
            dueAt: input.dueAt,
            invoiceMonth: input.invoiceMonth,
            issuedAt: input.issuedAt,
          });

          let resolvedLineItems: InvoiceMutationInput["lineItems"];
          try {
            resolvedLineItems = resolveChatInvoiceLineItems({
              fallbackDescription: input.lineItemDescription,
              lineItems: input.lineItems,
              lineItemsText: input.lineItemsText,
              taxRate,
              templateLineItems: useTemplateDefaults
                ? latestInvoiceTemplate?.lineItems
                : undefined,
              totalAmount: requestedTotalAmount,
            });
          } catch (error) {
            if (isChatInvoiceLineItemParseError(error)) {
              return {
                kind: "needs-input",
                message:
                  "I need an amount or line items before I can create that invoice. Say something like 'for 1000', 'Development, 40hrs at 120', or 'same as the last invoice'.",
              };
            }

            throw error;
          }

          const mutationInput: InvoiceMutationInput = {
            clientId: client.id,
            currency:
              input.currency ??
              (useTemplateDefaults ? latestInvoiceTemplate?.currency : null) ??
              client.defaultCurrency ??
              auth.org.defaultCurrency ??
              "EUR",
            dueAt: dates.dueAt,
            internalNotes:
              input.internalNotes ??
              (input.copyPreviousInvoice
                ? (latestInvoiceTemplate?.internalNotes ?? undefined)
                : undefined),
            issuedAt: dates.issuedAt,
            lineItems: resolvedLineItems,
            notes:
              input.notes ??
              (input.copyPreviousInvoice
                ? (latestInvoiceTemplate?.notes ?? undefined)
                : undefined),
            reverseCharge:
              input.reverseCharge === undefined
                ? useTemplateDefaults
                  ? (latestInvoiceTemplate?.reverseCharge ?? "false")
                  : "false"
                : input.reverseCharge
                  ? "true"
                  : "false",
            taxRate,
          };

          const result = await createInvoice(
            buildServiceContext(auth),
            mutationInput,
          );
          if ("error" in result) {
            throw new Error(result.error);
          }

          const invoice = await loadInvoiceSummary(auth, result.invoiceId);
          revalidateInvoiceViews(invoice.id);

          return {
            invoice: toInvoiceSummary(invoice),
            kind: "invoice",
            message: `Created draft invoice ${invoice.number}.`,
          };
        }, MUTATION_RETRIES),
      inputSchema: z.object({
        amount: z.number().positive().optional(),
        clientId: z.string().uuid().optional(),
        clientName: z.string().trim().optional(),
        copyPreviousInvoice: z.boolean().optional(),
        currency: z.string().trim().optional(),
        dueAt: z.string().trim().optional(),
        internalNotes: z.string().trim().optional(),
        invoiceMonth: z.string().trim().optional(),
        issuedAt: z.string().trim().optional(),
        lineItemDescription: z.string().trim().optional(),
        lineItems: z
          .array(
            z.object({
              description: z.string().trim().min(1),
              quantity: z.number().positive(),
              unitPrice: z.number().min(0),
            }),
          )
          .optional(),
        lineItemsText: z.string().trim().optional(),
        notes: z.string().trim().optional(),
        reverseCharge: z.boolean().optional(),
        taxRate: z.number().min(0).max(100).optional(),
        totalAmount: z.number().positive().optional(),
      }),
    }),
    delete_invoice_draft: tool({
      description: "Delete a draft or cancelled invoice.",
      execute: (input) =>
        withRetry(async () => {
          const invoice = await resolveInvoice(auth, input);
          const result = await deleteInvoice(
            buildServiceContext(auth),
            invoice.id,
          );
          if ("error" in result) {
            throw new Error(result.error);
          }

          revalidateInvoiceViews();

          return {
            kind: "invoice",
            message: `Deleted invoice ${invoice.number}.`,
          };
        }, MUTATION_RETRIES),
      inputSchema: z.object({
        invoiceId: z.string().uuid().optional(),
        invoiceNumber: z.string().trim().optional(),
      }),
    }),
    ...createInvoiceInsightTools(auth, {
      isClientResolutionError,
      listClientsForOrg,
      resolveClient,
      withRetry,
    }),
    duplicate_invoice: tool({
      description: "Duplicate an existing invoice into a fresh draft.",
      execute: (input) =>
        withRetry(async () => {
          const invoice = await resolveInvoice(auth, input);
          const result = await duplicateInvoice(
            buildServiceContext(auth),
            invoice.id,
          );
          if ("error" in result) {
            throw new Error(result.error);
          }

          const duplicatedInvoice = await loadInvoiceSummary(
            auth,
            result.invoiceId,
          );
          revalidateInvoiceViews(duplicatedInvoice.id);

          return {
            invoice: toInvoiceSummary(duplicatedInvoice),
            kind: "invoice",
            message: `Duplicated invoice ${invoice.number} as ${duplicatedInvoice.number}.`,
          };
        }, MUTATION_RETRIES),
      inputSchema: z.object({
        invoiceId: z.string().uuid().optional(),
        invoiceNumber: z.string().trim().optional(),
      }),
    }),
    get_invoice: tool({
      description:
        "Get a specific invoice by id or invoice number, including its PDF download link.",
      execute: (input) =>
        withRetry(async () => {
          const invoice = await resolveInvoice(auth, input);

          return {
            downloadUrl: `/api/invoices/${invoice.id}/pdf`,
            invoice: toInvoiceSummary(invoice),
            kind: "invoice",
            lineItems: invoice.lineItems.map((item) => ({
              amount: item.amount,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
            })),
            message: `Loaded invoice ${invoice.number}.`,
          };
        }),
      inputSchema: z.object({
        invoiceId: z.string().uuid().optional(),
        invoiceNumber: z.string().trim().optional(),
      }),
    }),
    list_clients: tool({
      description: "List clients in the current workspace.",
      execute: ({ search }) =>
        withRetry(async () => {
          const clientList = await listClientsForOrg(auth.org.id, search, 20);

          return {
            clients: clientList,
            kind: "client-list",
            total: clientList.length,
          };
        }),
      inputSchema: z.object({
        search: z.string().trim().optional(),
      }),
    }),
    list_invoices: tool({
      description:
        "List invoices with optional status, client, and search filters.",
      execute: ({
        clientId,
        clientName,
        from,
        page,
        perPage,
        period,
        search,
        status,
        to,
      }) =>
        withRetry(async () => {
          const resolvedClient =
            clientId || clientName
              ? await resolveClient(auth, { clientId, clientName })
              : null;
          let resolvedPeriod: InvoicePeriod | null = null;
          try {
            resolvedPeriod =
              period || from || to
                ? resolveToolPeriod({ from, period, to }, "all")
                : null;
          } catch (error) {
            return {
              kind: "needs-input",
              message:
                error instanceof Error
                  ? error.message
                  : "I need a valid date range.",
            };
          }
          const result = await getInvoiceList(auth.org.id, {
            clientId: resolvedClient?.id ?? null,
            issuedFrom: resolvedPeriod?.from,
            issuedTo: resolvedPeriod?.to,
            page: page ?? 1,
            perPage: perPage ?? 12,
            search: search ?? null,
            status: status ?? null,
          });

          return {
            invoices: result.data.map((invoice) => ({
              clientName: invoice.client?.name ?? null,
              currency: invoice.currency,
              dueAt: invoice.dueAt,
              id: invoice.id,
              number: invoice.number,
              status: invoice.status,
              total: invoice.total,
            })),
            kind: "invoice-list",
            pagination: result.pagination,
          };
        }),
      inputSchema: z.object({
        clientId: z.string().uuid().optional(),
        clientName: z.string().trim().optional(),
        from: z.string().trim().optional(),
        page: z.number().int().min(1).optional(),
        period: invoicePeriodSchema.optional(),
        perPage: z.number().int().min(1).max(50).optional(),
        search: z.string().trim().optional(),
        status: invoiceStatusSchema.optional(),
        to: z.string().trim().optional(),
      }),
    }),
    mark_invoice_paid: tool({
      description: "Mark an invoice as paid.",
      execute: (input) =>
        withRetry(async () => {
          const invoice = await resolveInvoice(auth, input);
          const result = await markInvoicePaid(
            buildServiceContext(auth),
            invoice.id,
          );
          if ("error" in result) {
            throw new Error(result.error);
          }

          const updatedInvoice = await loadInvoiceSummary(auth, invoice.id);
          revalidateInvoiceViews(updatedInvoice.id);

          return {
            invoice: toInvoiceSummary(updatedInvoice),
            kind: "invoice",
            message: `Marked invoice ${updatedInvoice.number} as paid.`,
          };
        }, MUTATION_RETRIES),
      inputSchema: z.object({
        invoiceId: z.string().uuid().optional(),
        invoiceNumber: z.string().trim().optional(),
      }),
    }),
    send_invoice: tool({
      description: "Send a draft invoice.",
      execute: (input) =>
        withRetry(async () => {
          const invoice = await resolveInvoice(auth, input);
          const result = await sendInvoice(
            buildServiceContext(auth),
            invoice.id,
          );
          if ("error" in result) {
            throw new Error(result.error);
          }

          const updatedInvoice = await loadInvoiceSummary(auth, invoice.id);
          revalidateInvoiceViews(updatedInvoice.id);

          return {
            invoice: toInvoiceSummary(updatedInvoice),
            kind: "invoice",
            message: `Sent invoice ${updatedInvoice.number}.`,
            warning: result.warning,
          };
        }, MUTATION_RETRIES),
      inputSchema: z.object({
        invoiceId: z.string().uuid().optional(),
        invoiceNumber: z.string().trim().optional(),
      }),
    }),
    send_invoice_reminder: tool({
      description: "Send a reminder for a sent or overdue invoice.",
      execute: (input) =>
        withRetry(async () => {
          const invoice = await resolveInvoice(auth, input);
          const result = await sendReminder(
            buildServiceContext(auth),
            invoice.id,
          );
          if ("error" in result) {
            throw new Error(result.error);
          }

          const updatedInvoice = await loadInvoiceSummary(auth, invoice.id);
          revalidateInvoiceViews(updatedInvoice.id);

          return {
            invoice: toInvoiceSummary(updatedInvoice),
            kind: "invoice",
            message: `Queued a reminder for invoice ${updatedInvoice.number}.`,
          };
        }, MUTATION_RETRIES),
      inputSchema: z.object({
        invoiceId: z.string().uuid().optional(),
        invoiceNumber: z.string().trim().optional(),
      }),
    }),
  };
}
/* eslint-enable perfectionist/sort-objects */
