import { tool } from "ai";
import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getInvoiceList } from "@/lib/api-invoices";
import type { AuthenticatedUserContext } from "@/lib/auth";
import { getDefaultInvoiceDates, resolveChatInvoiceLineItems } from "@/lib/chat-parser";
import { db } from "@/lib/db";
import { clients, invoices } from "@/lib/db/schema";
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
      .where(and(eq(clients.id, input.clientId), eq(clients.orgId, auth.org.id)))
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
  const normalizedQuery = input.clientName.trim().toLowerCase();
  const exactMatches = matches.filter((client) =>
    [client.name, client.company, client.email].some(
      (value) => typeof value === "string" && value.toLowerCase() === normalizedQuery,
    ),
  );

  const resolvedMatches = exactMatches.length > 0 ? exactMatches : matches;
  if (resolvedMatches.length === 0) {
    throw new Error(`No client matched '${input.clientName}'.`);
  }

  if (resolvedMatches.length > 1) {
    throw new Error(
      `Client name '${input.clientName}' is ambiguous. Matches: ${resolvedMatches
        .map((client) => `${client.name} [${client.id}]`)
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
    .where(and(eq(invoices.orgId, auth.org.id), eq(invoices.number, input.invoiceNumber.trim())))
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
              `${client.name} <${client.email}>${client.company ? ` (${client.company})` : ""}`,
          )
          .join("; ")
      : "No clients yet.";

  const recentInvoiceSummary =
    context.recentInvoices.length > 0
      ? context.recentInvoices
          .map(
            (invoice) =>
              `${invoice.number} ${invoice.status} ${invoice.total ?? "0.00"} ${invoice.currency ?? "EUR"}`,
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
    "Available invoice actions include creating drafts, listing, loading details, sending, reminding, duplicating, marking paid, cancelling, and deleting draft invoices.",
    "When creating invoices, prefer clientName when the user mentions a client by name. If line items are described naturally, pass them via lineItemsText.",
    "Be concise. After a successful mutation, confirm the result with the invoice number or client name.",
  ].join("\n");
}

export function createChatTools(auth: ChatToolContext) {
  return {
    cancel_invoice: tool({
      description: "Cancel a sent or overdue invoice.",
      execute: async (input) => {
        const invoice = await resolveInvoice(auth, input);
        const result = await cancelInvoice(buildServiceContext(auth), invoice.id);
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
      },
      inputSchema: z.object({
        invoiceId: z.string().uuid().optional(),
        invoiceNumber: z.string().trim().optional(),
      }),
    }),
    create_client: tool({
      description: "Create a client in Nota.",
      execute: async (input) => {
        const [client] = await db
          .insert(clients)
          .values({
            address: input.address,
            company: input.company,
            defaultCurrency: input.defaultCurrency ?? auth.org.defaultCurrency ?? "EUR",
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
      },
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
      execute: async (input) => {
        const client = await resolveClient(auth, input);
        const dates = getDefaultInvoiceDates();
        const mutationInput: InvoiceMutationInput = {
          clientId: client.id,
          currency: input.currency ?? client.defaultCurrency ?? auth.org.defaultCurrency ?? "EUR",
          dueAt: input.dueAt ?? dates.dueAt,
          internalNotes: input.internalNotes,
          issuedAt: input.issuedAt ?? dates.issuedAt,
          lineItems: resolveChatInvoiceLineItems({
            lineItems: input.lineItems,
            lineItemsText: input.lineItemsText,
          }),
          notes: input.notes,
          reverseCharge: input.reverseCharge ? "true" : "false",
          taxRate: input.taxRate ?? 0,
        };

        const result = await createInvoice(buildServiceContext(auth), mutationInput);
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
      },
      inputSchema: z.object({
        clientId: z.string().uuid().optional(),
        clientName: z.string().trim().optional(),
        currency: z.string().trim().optional(),
        dueAt: z.string().trim().optional(),
        internalNotes: z.string().trim().optional(),
        issuedAt: z.string().trim().optional(),
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
      }),
    }),
    delete_invoice_draft: tool({
      description: "Delete a draft invoice.",
      execute: async (input) => {
        const invoice = await resolveInvoice(auth, input);
        const result = await deleteInvoice(buildServiceContext(auth), invoice.id);
        if ("error" in result) {
          throw new Error(result.error);
        }

        revalidateInvoiceViews();

        return {
          kind: "invoice",
          message: `Deleted draft invoice ${invoice.number}.`,
        };
      },
      inputSchema: z.object({
        invoiceId: z.string().uuid().optional(),
        invoiceNumber: z.string().trim().optional(),
      }),
    }),
    duplicate_invoice: tool({
      description: "Duplicate an existing invoice into a fresh draft.",
      execute: async (input) => {
        const invoice = await resolveInvoice(auth, input);
        const result = await duplicateInvoice(buildServiceContext(auth), invoice.id);
        if ("error" in result) {
          throw new Error(result.error);
        }

        const duplicatedInvoice = await loadInvoiceSummary(auth, result.invoiceId);
        revalidateInvoiceViews(duplicatedInvoice.id);

        return {
          invoice: toInvoiceSummary(duplicatedInvoice),
          kind: "invoice",
          message: `Duplicated invoice ${invoice.number} as ${duplicatedInvoice.number}.`,
        };
      },
      inputSchema: z.object({
        invoiceId: z.string().uuid().optional(),
        invoiceNumber: z.string().trim().optional(),
      }),
    }),
    get_dashboard_stats: tool({
      description: "Get current invoice and client stats for the workspace.",
      execute: async () => {
        const [invoiceRows, clientList] = await Promise.all([
          db
            .select({
              currency: invoices.currency,
              id: invoices.id,
              number: invoices.number,
              status: invoices.status,
              total: invoices.total,
            })
            .from(invoices)
            .where(eq(invoices.orgId, auth.org.id))
            .orderBy(desc(invoices.createdAt)),
          listClientsForOrg(auth.org.id, undefined, 12),
        ]);

        const counts = {
          cancelled: 0,
          clients: clientList.length,
          draft: 0,
          overdue: 0,
          paid: 0,
          sent: 0,
          totalInvoices: invoiceRows.length,
        };

        for (const invoice of invoiceRows) {
          const status = invoice.status ?? "draft";
          if (status in counts) {
            counts[status as keyof typeof counts] += 1;
          }
        }

        return {
          counts,
          kind: "dashboard",
          recentInvoices: invoiceRows.slice(0, 5),
          topClients: clientList.slice(0, 5),
        };
      },
      inputSchema: z.object({}),
    }),
    get_invoice: tool({
      description: "Get a specific invoice by id or invoice number.",
      execute: async (input) => {
        const invoice = await resolveInvoice(auth, input);

        return {
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
      },
      inputSchema: z.object({
        invoiceId: z.string().uuid().optional(),
        invoiceNumber: z.string().trim().optional(),
      }),
    }),
    list_clients: tool({
      description: "List clients in the current workspace.",
      execute: async ({ search }) => {
        const clientList = await listClientsForOrg(auth.org.id, search, 20);

        return {
          clients: clientList,
          kind: "client-list",
          total: clientList.length,
        };
      },
      inputSchema: z.object({
        search: z.string().trim().optional(),
      }),
    }),
    list_invoices: tool({
      description: "List invoices with optional status, client, and search filters.",
      execute: async ({ clientId, clientName, page, perPage, search, status }) => {
        const resolvedClient =
          clientId || clientName ? await resolveClient(auth, { clientId, clientName }) : null;
        const result = await getInvoiceList(auth.org.id, {
          clientId: resolvedClient?.id ?? null,
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
      },
      inputSchema: z.object({
        clientId: z.string().uuid().optional(),
        clientName: z.string().trim().optional(),
        page: z.number().int().min(1).optional(),
        perPage: z.number().int().min(1).max(50).optional(),
        search: z.string().trim().optional(),
        status: z.enum(["draft", "sent", "paid", "overdue", "cancelled"]).optional(),
      }),
    }),
    mark_invoice_paid: tool({
      description: "Mark an invoice as paid.",
      execute: async (input) => {
        const invoice = await resolveInvoice(auth, input);
        const result = await markInvoicePaid(buildServiceContext(auth), invoice.id);
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
      },
      inputSchema: z.object({
        invoiceId: z.string().uuid().optional(),
        invoiceNumber: z.string().trim().optional(),
      }),
    }),
    send_invoice: tool({
      description: "Send a draft invoice.",
      execute: async (input) => {
        const invoice = await resolveInvoice(auth, input);
        const result = await sendInvoice(buildServiceContext(auth), invoice.id);
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
      },
      inputSchema: z.object({
        invoiceId: z.string().uuid().optional(),
        invoiceNumber: z.string().trim().optional(),
      }),
    }),
    send_invoice_reminder: tool({
      description: "Send a reminder for a sent or overdue invoice.",
      execute: async (input) => {
        const invoice = await resolveInvoice(auth, input);
        const result = await sendReminder(buildServiceContext(auth), invoice.id);
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
      },
      inputSchema: z.object({
        invoiceId: z.string().uuid().optional(),
        invoiceNumber: z.string().trim().optional(),
      }),
    }),
  };
}
