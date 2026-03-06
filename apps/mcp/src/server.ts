import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import {
  createNotaClientFromEnv,
  NotaApiError,
  type ClientRecord,
  type InvoiceDetail,
  type InvoiceLineItemInput,
  type InvoiceMutationResponse,
  type InvoiceStatus,
  type NotaClient,
} from "./client";
import { getDefaultInvoiceDates, resolveLineItems } from "./invoice-input";

type ClientMatch = {
  company?: string | null;
  email: string;
  id: string;
  name: string;
};

type InvoiceReference = {
  invoiceId?: string;
  invoiceNumber?: string;
};

function getTemplateParam(value: string | string[]) {
  return Array.isArray(value) ? value[0] ?? "" : value;
}

const toolInstructions =
  "Use clientName or invoiceNumber when the human mentions names or invoice numbers instead of raw UUIDs.";

function buildServer(client: NotaClient) {
  const server = new McpServer(
    {
      name: "nota",
      title: "Nota",
      version: "0.1.0",
    },
    {
      capabilities: {
        logging: {},
      },
      instructions:
        "Nota exposes organization-scoped invoicing tools and read-only resources. " + toolInstructions,
    },
  );

  server.registerTool(
    "list_clients",
    {
      description: "List clients in Nota, optionally filtered by search.",
      inputSchema: {
        page: z.number().int().min(1).optional(),
        perPage: z.number().int().min(1).max(100).optional(),
        search: z.string().trim().optional(),
      },
    },
    async ({ page, perPage, search }) => {
      return handleTool(async () => {
        const result = await client.listClients({ page, perPage, search });
        return successResult(
          formatClientList(result.data),
          {
            clients: result.data,
            pagination: result.pagination,
          },
        );
      });
    },
  );

  server.registerTool(
    "create_client",
    {
      description: "Create a new client in Nota.",
      inputSchema: {
        address: z.string().trim().optional(),
        bankAccountId: z.string().uuid().nullable().optional(),
        company: z.string().trim().optional(),
        defaultCurrency: z.string().trim().optional(),
        email: z.string().email(),
        name: z.string().trim().min(1),
        notes: z.string().trim().optional(),
        vatNumber: z.string().trim().optional(),
      },
    },
    async (input) => {
      return handleTool(async () => {
        const clientRecord = await client.createClient(input);
        return successResult(formatClient(clientRecord), { client: clientRecord });
      });
    },
  );

  server.registerTool(
    "list_invoices",
    {
      description: "List invoices, optionally filtered by status, client, or search.",
      inputSchema: {
        clientId: z.string().uuid().optional(),
        clientName: z.string().trim().optional(),
        page: z.number().int().min(1).optional(),
        perPage: z.number().int().min(1).max(100).optional(),
        search: z.string().trim().optional(),
        status: z.enum(["draft", "sent", "paid", "overdue", "cancelled"]).optional(),
      },
    },
    async ({ clientId, clientName, page, perPage, search, status }) => {
      return handleTool(async () => {
        const resolvedClientId = clientId ?? (await resolveClientId(client, clientName));
        const result = await client.listInvoices({
          clientId: resolvedClientId,
          page,
          perPage,
          search,
          status,
        });

        return successResult(formatInvoiceList(result.data), {
          invoices: result.data,
          pagination: result.pagination,
        });
      });
    },
  );

  server.registerTool(
    "create_invoice",
    {
      description:
        "Create a draft invoice. Accepts either clientId or clientName and either structured lineItems or lineItemsText.",
      inputSchema: {
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
      },
    },
    async ({
      clientId,
      clientName,
      currency,
      dueAt,
      internalNotes,
      issuedAt,
      lineItems,
      lineItemsText,
      notes,
      reverseCharge,
      taxRate,
    }) => {
      return handleTool(async () => {
        const resolvedClientId = clientId ?? (await resolveClientId(client, clientName));
        const dates = getDefaultInvoiceDates();
        const resolvedItems = resolveLineItems({ lineItems, lineItemsText });
        const result = await client.createInvoice({
          clientId: resolvedClientId,
          currency,
          dueAt: dueAt ?? dates.dueAt,
          internalNotes,
          issuedAt: issuedAt ?? dates.issuedAt,
          lineItems: resolvedItems,
          notes,
          reverseCharge,
          taxRate,
        });

        return invoiceMutationResult("Created invoice", result);
      });
    },
  );

  server.registerTool(
    "get_invoice",
    {
      description: "Fetch a single invoice by UUID or invoice number.",
      inputSchema: {
        invoiceId: z.string().uuid().optional(),
        invoiceNumber: z.string().trim().optional(),
      },
    },
    async (reference) => {
      return handleTool(async () => {
        const invoice = await resolveInvoice(client, reference);
        return successResult(formatInvoice(invoice), { invoice });
      });
    },
  );

  server.registerTool(
    "send_invoice",
    {
      description: "Send a draft invoice to the client.",
      inputSchema: {
        invoiceId: z.string().uuid().optional(),
        invoiceNumber: z.string().trim().optional(),
      },
    },
    async (reference) => {
      return handleTool(async () => {
        const result = await runInvoiceAction(client, reference, (invoiceId) => client.sendInvoice(invoiceId));
        return invoiceMutationResult("Sent invoice", result);
      });
    },
  );

  server.registerTool(
    "send_reminder",
    {
      description: "Send a reminder for a sent or overdue invoice.",
      inputSchema: {
        invoiceId: z.string().uuid().optional(),
        invoiceNumber: z.string().trim().optional(),
      },
    },
    async (reference) => {
      return handleTool(async () => {
        const result = await runInvoiceAction(client, reference, (invoiceId) =>
          client.sendReminder(invoiceId),
        );
        return invoiceMutationResult("Queued reminder", result);
      });
    },
  );

  server.registerTool(
    "mark_paid",
    {
      description: "Mark an invoice as paid.",
      inputSchema: {
        invoiceId: z.string().uuid().optional(),
        invoiceNumber: z.string().trim().optional(),
      },
    },
    async (reference) => {
      return handleTool(async () => {
        const result = await runInvoiceAction(client, reference, (invoiceId) =>
          client.markInvoicePaid(invoiceId),
        );
        return invoiceMutationResult("Marked invoice paid", result);
      });
    },
  );

  server.registerTool(
    "cancel_invoice",
    {
      description: "Cancel a sent or overdue invoice.",
      inputSchema: {
        invoiceId: z.string().uuid().optional(),
        invoiceNumber: z.string().trim().optional(),
      },
    },
    async (reference) => {
      return handleTool(async () => {
        const result = await runInvoiceAction(client, reference, (invoiceId) => client.cancelInvoice(invoiceId));
        return invoiceMutationResult("Cancelled invoice", result);
      });
    },
  );

  server.registerTool(
    "duplicate_invoice",
    {
      description: "Duplicate an invoice into a fresh draft.",
      inputSchema: {
        invoiceId: z.string().uuid().optional(),
        invoiceNumber: z.string().trim().optional(),
      },
    },
    async (reference) => {
      return handleTool(async () => {
        const result = await runInvoiceAction(client, reference, (invoiceId) =>
          client.duplicateInvoice(invoiceId),
        );
        return invoiceMutationResult("Duplicated invoice", result);
      });
    },
  );

  server.registerTool(
    "download_pdf",
    {
      description: "Download the PDF for an invoice by UUID or invoice number.",
      inputSchema: {
        invoiceId: z.string().uuid().optional(),
        invoiceNumber: z.string().trim().optional(),
      },
    },
    async (reference) => {
      return handleTool(async () => {
        const invoice = await resolveInvoice(client, reference);
        const pdf = await client.downloadPdf(invoice.id);
        return successResult(
          `Downloaded ${pdf.filename ?? `${invoice.number}.pdf`} (${pdf.data.byteLength} bytes).`,
          {
            bytes: pdf.data.byteLength,
            filename: pdf.filename ?? `${invoice.number}.pdf`,
            invoice: {
              id: invoice.id,
              number: invoice.number,
            },
            mimeType: pdf.contentType,
            pdfBase64: Buffer.from(pdf.data).toString("base64"),
          },
        );
      });
    },
  );

  server.registerResource(
    "invoice-summary",
    "nota://invoices/summary",
    {
      description: "Invoice and client counts plus a short recent invoice list.",
      mimeType: "application/json",
      title: "Nota Invoice Summary",
    },
    async (uri): Promise<ReadResourceResult> => {
      const summary = await getInvoiceSummary(client);
      return jsonResource(uri.href, summary);
    },
  );

  server.registerResource(
    "invoice-detail",
    new ResourceTemplate("nota://invoices/{invoiceId}", {
      complete: {
        invoiceId: async (value) => completeInvoiceIds(client, value),
      },
      list: async () => ({
        resources: (await client.listInvoices({ page: 1, perPage: 50 })).data.map((invoice) => ({
          name: invoice.number,
          uri: `nota://invoices/${invoice.id}`,
        })),
      }),
    }),
    {
      description: "Full invoice detail in JSON form.",
      mimeType: "application/json",
      title: "Nota Invoice",
    },
    async (uri, { invoiceId }): Promise<ReadResourceResult> => {
      const invoice = await client.getInvoice(getTemplateParam(invoiceId));
      return jsonResource(uri.href, invoice);
    },
  );

  server.registerResource(
    "client-detail",
    new ResourceTemplate("nota://clients/{clientId}", {
      complete: {
        clientId: async (value) => completeClientIds(client, value),
      },
      list: async () => ({
        resources: (await client.listClients({ page: 1, perPage: 50 })).data.map((clientRecord) => ({
          name: clientRecord.name,
          uri: `nota://clients/${clientRecord.id}`,
        })),
      }),
    }),
    {
      description: "Client detail in JSON form.",
      mimeType: "application/json",
      title: "Nota Client",
    },
    async (uri, { clientId }): Promise<ReadResourceResult> => {
      const clientRecord = await client.getClient(getTemplateParam(clientId));
      return jsonResource(uri.href, clientRecord);
    },
  );

  return server;
}

async function getInvoiceSummary(client: NotaClient) {
  const [me, recentInvoices, clients, draft, sent, paid, overdue, cancelled] = await Promise.all([
    client.getMe(),
    client.listInvoices({ page: 1, perPage: 10 }),
    client.listClients({ page: 1, perPage: 1 }),
    client.listInvoices({ page: 1, perPage: 1, status: "draft" }),
    client.listInvoices({ page: 1, perPage: 1, status: "sent" }),
    client.listInvoices({ page: 1, perPage: 1, status: "paid" }),
    client.listInvoices({ page: 1, perPage: 1, status: "overdue" }),
    client.listInvoices({ page: 1, perPage: 1, status: "cancelled" }),
  ]);

  return {
    counts: {
      cancelled: cancelled.pagination.total,
      clients: clients.pagination.total,
      draft: draft.pagination.total,
      overdue: overdue.pagination.total,
      paid: paid.pagination.total,
      sent: sent.pagination.total,
      totalInvoices:
        draft.pagination.total +
        sent.pagination.total +
        paid.pagination.total +
        overdue.pagination.total +
        cancelled.pagination.total,
    },
    org: me.org,
    recentInvoices: recentInvoices.data,
    role: me.role,
    user: me.user,
  };
}

function successResult(text: string, structuredContent?: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text", text }],
    structuredContent,
  };
}

function errorResult(message: string, structuredContent?: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
    structuredContent,
  };
}

function jsonResource(uri: string, value: unknown): ReadResourceResult {
  return {
    contents: [
      {
        mimeType: "application/json",
        text: JSON.stringify(value, null, 2),
        uri,
      },
    ],
  };
}

async function handleTool(callback: () => Promise<CallToolResult>) {
  try {
    return await callback();
  } catch (error) {
    return toToolError(error);
  }
}

function toToolError(error: unknown) {
  if (error instanceof NotaApiError) {
    return errorResult(`Nota API error (${error.status}): ${error.message}`, {
      details: error.details,
      status: error.status,
    });
  }

  if (error instanceof Error) {
    return errorResult(error.message);
  }

  return errorResult("Unknown MCP server error");
}

function formatClient(client: ClientRecord) {
  const details = [client.name, client.company, client.email].filter(Boolean).join(" | ");
  return `${details}\nID: ${client.id}`;
}

function formatClientList(clients: Array<ClientRecord>) {
  if (clients.length === 0) {
    return "No clients found.";
  }

  return clients.map((client) => `- ${client.name} (${client.email}) [${client.id}]`).join("\n");
}

function formatInvoice(invoice: InvoiceDetail) {
  const clientName = invoice.client?.name ?? "Unknown client";
  return [
    `${invoice.number} | ${invoice.status.toUpperCase()} | ${invoice.total ?? "0.00"} ${invoice.currency ?? "EUR"}`,
    `Client: ${clientName}`,
    `Issued: ${invoice.issuedAt} | Due: ${invoice.dueAt}`,
    `ID: ${invoice.id}`,
  ].join("\n");
}

function formatInvoiceList(invoices: Array<{ id: string; number: string; status: InvoiceStatus; total: string | null; currency: string | null }>) {
  if (invoices.length === 0) {
    return "No invoices found.";
  }

  return invoices
    .map((invoice) => `- ${invoice.number} | ${invoice.status} | ${invoice.total ?? "0.00"} ${invoice.currency ?? "EUR"} [${invoice.id}]`)
    .join("\n");
}

async function resolveClientId(client: NotaClient, clientName?: string) {
  if (!clientName?.trim()) {
    throw new Error("Provide either clientId or clientName.");
  }

  const matches = await findClientMatches(client, clientName);
  if (matches.length === 0) {
    throw new Error(`No client matched '${clientName}'.`);
  }

  if (matches.length > 1) {
    throw new Error(
      `Client name '${clientName}' is ambiguous. Matches: ${matches
        .map((match) => `${match.name} [${match.id}]`)
        .join(", ")}`,
    );
  }

  return matches[0].id;
}

async function findClientMatches(client: NotaClient, query: string): Promise<Array<ClientMatch>> {
  const normalizedQuery = query.trim().toLowerCase();
  const result = await client.listClients({ page: 1, perPage: 20, search: query });
  const exactMatches = result.data.filter((candidate) =>
    [candidate.name, candidate.company, candidate.email]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLowerCase() === normalizedQuery),
  );

  if (exactMatches.length > 0) {
    return exactMatches.map(toClientMatch);
  }

  if (result.data.length === 1) {
    return result.data.map(toClientMatch);
  }

  return result.data.map(toClientMatch);
}

function toClientMatch(client: ClientRecord): ClientMatch {
  return {
    company: client.company,
    email: client.email,
    id: client.id,
    name: client.name,
  };
}

async function resolveInvoice(client: NotaClient, reference: InvoiceReference) {
  if (reference.invoiceId) {
    return client.getInvoice(reference.invoiceId);
  }

  if (!reference.invoiceNumber?.trim()) {
    throw new Error("Provide either invoiceId or invoiceNumber.");
  }

  const invoice = await client.findInvoiceByNumber(reference.invoiceNumber);
  if (invoice) {
    return invoice;
  }

  const searchResult = await client.listInvoices({ page: 1, perPage: 20, search: reference.invoiceNumber });
  if (searchResult.data.length > 0) {
    throw new Error(
      `Invoice '${reference.invoiceNumber}' was not an exact match. Similar invoices: ${searchResult.data
        .map((entry) => `${entry.number} [${entry.id}]`)
        .join(", ")}`,
    );
  }

  throw new Error(`Invoice '${reference.invoiceNumber}' not found.`);
}

async function runInvoiceAction(
  client: NotaClient,
  reference: InvoiceReference,
  action: (invoiceId: string) => Promise<InvoiceMutationResponse>,
) {
  const invoice = await resolveInvoice(client, reference);
  return action(invoice.id);
}

function invoiceMutationResult(prefix: string, result: InvoiceMutationResponse) {
  return successResult(`${prefix}: ${result.invoice.number}`, {
    invoice: result.invoice,
    warning: result.warning,
  });
}

async function completeInvoiceIds(client: NotaClient, value: string) {
  const result = await client.listInvoices({ page: 1, perPage: 20, search: value || undefined });
  return result.data.map((invoice) => invoice.id);
}

async function completeClientIds(client: NotaClient, value: string) {
  const result = await client.listClients({ page: 1, perPage: 20, search: value || undefined });
  return result.data.map((clientRecord) => clientRecord.id);
}

export function createNotaMcpServer(client: NotaClient = createNotaClientFromEnv()) {
  return buildServer(client);
}

export function createInvoiceLinesForPrompt(lines: Array<InvoiceLineItemInput>) {
  return lines.map((line) => `${line.description} | ${line.quantity} | ${line.unitPrice}`).join("\n");
}
