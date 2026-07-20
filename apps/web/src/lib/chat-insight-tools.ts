import { tool } from "ai";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";

import { getInvoiceList } from "@/lib/api-invoices";
import type { AuthenticatedUserContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { clients, invoices, invoiceStatusEnum } from "@/lib/db/schema";
import {
  listInvoicesForExport,
  MAX_INVOICE_ARCHIVE_SIZE,
} from "@/lib/invoice-export";
import {
  summarizeInvoiceRows,
  type InvoiceInsightRow,
} from "@/lib/invoice-insights";
import {
  buildInvoiceArchiveFilename,
  buildInvoiceArchiveUrl,
  getPreviousInvoicePeriod,
  INVOICE_PERIOD_KEYS,
  type InvoicePeriod,
  type InvoicePeriodKey,
  resolveInvoicePeriod,
} from "@/lib/invoice-period";

type ChatToolContext = Pick<AuthenticatedUserContext, "org" | "role" | "user">;

type ResolvedClient = {
  defaultCurrency: string | null;
  email: string;
  id: string;
  name: string;
};

type ClientListItem = ResolvedClient & {
  company: string | null;
};

type InsightToolDependencies = {
  isClientResolutionError: (error: unknown) => boolean;
  listClientsForOrg: (
    orgId: string,
    search?: string,
    limit?: number,
  ) => Promise<Array<ClientListItem>>;
  resolveClient: (
    auth: ChatToolContext,
    input: { clientId?: string; clientName?: string },
  ) => Promise<ResolvedClient>;
  withRetry: <T>(fn: () => Promise<T>, retries?: number) => Promise<T>;
};

type PeriodToolInput = {
  from?: string;
  period?: InvoicePeriodKey;
  to?: string;
};

const invoicePeriodSchema = z.enum(INVOICE_PERIOD_KEYS);
const invoiceStatusSchema = z.enum(invoiceStatusEnum.enumValues);

function resolveToolPeriod(input: PeriodToolInput, fallback: InvoicePeriodKey) {
  return resolveInvoicePeriod({
    from: input.from,
    period: input.period ?? (input.from || input.to ? "custom" : fallback),
    to: input.to,
  });
}

async function loadInvoiceInsightRows(
  orgId: string,
  input: {
    clientId?: string | null;
    dateBasis?: "issued" | "paid";
    period: InvoicePeriod;
  },
) {
  const dateColumn =
    input.dateBasis === "paid" ? invoices.paidAt : invoices.issuedAt;
  const clauses = [eq(invoices.orgId, orgId)];
  if (input.clientId) {
    clauses.push(eq(invoices.clientId, input.clientId));
  }
  if (input.dateBasis === "paid") {
    clauses.push(eq(invoices.status, "paid"));
  }
  if (input.period.from) {
    clauses.push(gte(dateColumn, input.period.from));
  }
  if (input.period.to) {
    clauses.push(lte(dateColumn, input.period.to));
  }

  return db
    .select({
      clientId: invoices.clientId,
      clientName: clients.name,
      currency: invoices.currency,
      dueAt: invoices.dueAt,
      issuedAt: invoices.issuedAt,
      paidAt: invoices.paidAt,
      status: invoices.status,
      total: invoices.total,
    })
    .from(invoices)
    .leftJoin(
      clients,
      and(eq(clients.id, invoices.clientId), eq(clients.orgId, orgId)),
    )
    .where(and(...clauses));
}

async function loadPeriodSummary(
  orgId: string,
  period: InvoicePeriod,
  clientId?: string,
) {
  const [issuedRows, collectionRows] = await Promise.all([
    loadInvoiceInsightRows(orgId, { clientId, period }),
    loadInvoiceInsightRows(orgId, {
      clientId,
      dateBasis: "paid",
      period,
    }),
  ]);

  return {
    issuedRows,
    summary: summarizeInvoiceRows(issuedRows, {
      collectionRows: collectionRows as Array<InvoiceInsightRow>,
    }),
  };
}

export function createInvoiceInsightTools(
  auth: ChatToolContext,
  dependencies: InsightToolDependencies,
) {
  const {
    isClientResolutionError,
    listClientsForOrg,
    resolveClient,
    withRetry,
  } = dependencies;

  /* eslint-disable perfectionist/sort-objects -- Keep the export and related financial read tools in task order. */
  return {
    download_invoice_archive: tool({
      description:
        "Prepare one ZIP containing individual invoice PDFs for a period, status, or client. Use this for requests to download multiple invoices.",
      execute: (input) =>
        withRetry(async () => {
          let period: InvoicePeriod;
          try {
            period = resolveToolPeriod(input, "last_quarter");
          } catch (error) {
            return {
              kind: "needs-input",
              message:
                error instanceof Error
                  ? error.message
                  : "I need a valid date range for that download.",
            };
          }

          let client: Awaited<ReturnType<typeof resolveClient>> | null = null;
          if (input.clientId || input.clientName) {
            try {
              client = await resolveClient(auth, input);
            } catch (error) {
              if (isClientResolutionError(error)) {
                return {
                  kind: "needs-input",
                  message:
                    error instanceof Error
                      ? error.message
                      : "Which client do you mean?",
                };
              }
              throw error;
            }
          }

          const rows = await listInvoicesForExport(auth.org.id, {
            clientId: client?.id,
            period,
            status: input.status,
          });
          if (rows.length === 0) {
            return {
              kind: "needs-input",
              message: `There are no matching invoices for ${period.label}.`,
            };
          }
          if (rows.length > MAX_INVOICE_ARCHIVE_SIZE) {
            return {
              kind: "needs-input",
              message: `That archive has more than ${MAX_INVOICE_ARCHIVE_SIZE} invoices. Ask for a shorter period, one client, or a status.`,
            };
          }

          const downloadUrl = buildInvoiceArchiveUrl({
            clientId: client?.id,
            from: period.key === "custom" ? period.from : undefined,
            period: period.key,
            status: input.status,
            to: period.key === "custom" ? period.to : undefined,
          });
          const filename = buildInvoiceArchiveFilename(period, {
            clientName: client?.name,
            status: input.status,
          });

          return {
            count: rows.length,
            downloadUrl,
            filename,
            kind: "invoice-archive",
            message: `Prepared a ${period.label} ZIP with ${rows.length} invoice${rows.length === 1 ? "" : "s"}.`,
            period,
          };
        }),
      inputSchema: z.object({
        clientId: z.string().uuid().optional(),
        clientName: z.string().trim().optional(),
        from: z.string().trim().optional(),
        period: invoicePeriodSchema.optional(),
        status: invoiceStatusSchema.optional(),
        to: z.string().trim().optional(),
      }),
    }),
    get_dashboard_stats: tool({
      description: "Get current invoice and client stats for the workspace.",
      execute: () =>
        withRetry(async () => {
          const [statusRows, recentInvoices, clientList, [clientCount]] =
            await Promise.all([
              db
                .select({
                  count: sql<number>`count(*)::int`,
                  status: invoices.status,
                })
                .from(invoices)
                .where(eq(invoices.orgId, auth.org.id))
                .groupBy(invoices.status),
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
                .orderBy(desc(invoices.createdAt))
                .limit(5),
              listClientsForOrg(auth.org.id, undefined, 5),
              db
                .select({ count: sql<number>`count(*)::int` })
                .from(clients)
                .where(eq(clients.orgId, auth.org.id)),
            ]);

          const counts = {
            cancelled: 0,
            clients: clientCount?.count ?? 0,
            draft: 0,
            overdue: 0,
            paid: 0,
            sent: 0,
            totalInvoices: 0,
          };
          for (const row of statusRows) {
            const status = row.status ?? "draft";
            counts[status] = row.count;
            counts.totalInvoices += row.count;
          }

          return {
            counts,
            kind: "dashboard",
            recentInvoices,
            topClients: clientList,
          };
        }),
      inputSchema: z.object({}),
    }),
    get_client_insights: tool({
      description:
        "Summarize invoice history, collections, open balances, payment speed, and recent invoices for one client.",
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
                    : "Which client do you mean?",
              };
            }
            throw error;
          }

          let period: InvoicePeriod;
          try {
            period = resolveToolPeriod(input, "all");
          } catch (error) {
            return {
              kind: "needs-input",
              message:
                error instanceof Error
                  ? error.message
                  : "I need a valid date range.",
            };
          }

          const [periodSummary, recentInvoices] = await Promise.all([
            loadPeriodSummary(auth.org.id, period, client.id),
            getInvoiceList(auth.org.id, {
              clientId: client.id,
              issuedFrom: period.from,
              issuedTo: period.to,
              page: 1,
              perPage: 5,
            }),
          ]);

          return {
            client: {
              email: client.email,
              id: client.id,
              name: client.name,
            },
            kind: "client-insights",
            period,
            recentInvoices: recentInvoices.data.map((invoice) => ({
              currency: invoice.currency,
              dueAt: invoice.dueAt,
              id: invoice.id,
              number: invoice.number,
              status: invoice.status,
              total: invoice.total,
            })),
            summary: periodSummary.summary,
          };
        }),
      inputSchema: z.object({
        clientId: z.string().uuid().optional(),
        clientName: z.string().trim().optional(),
        from: z.string().trim().optional(),
        period: invoicePeriodSchema.optional(),
        to: z.string().trim().optional(),
      }),
    }),
    get_invoice_analytics: tool({
      description:
        "Analyze issued, collected, outstanding, overdue, and draft invoice value by currency, including top clients and optional previous-period comparison. Collected uses payment dates; collection rate is the share of that period's issued value now paid.",
      execute: (input) =>
        withRetry(async () => {
          let period: InvoicePeriod;
          try {
            period = resolveToolPeriod(input, "this_quarter");
          } catch (error) {
            return {
              kind: "needs-input",
              message:
                error instanceof Error
                  ? error.message
                  : "I need a valid date range.",
            };
          }

          let client: Awaited<ReturnType<typeof resolveClient>> | null = null;
          if (input.clientId || input.clientName) {
            try {
              client = await resolveClient(auth, input);
            } catch (error) {
              if (isClientResolutionError(error)) {
                return {
                  kind: "needs-input",
                  message:
                    error instanceof Error
                      ? error.message
                      : "Which client do you mean?",
                };
              }
              throw error;
            }
          }

          const previousPeriod = input.comparePrevious
            ? getPreviousInvoicePeriod(period)
            : null;
          const [current, previous] = await Promise.all([
            loadPeriodSummary(auth.org.id, period, client?.id),
            previousPeriod
              ? loadPeriodSummary(auth.org.id, previousPeriod, client?.id)
              : Promise.resolve(null),
          ]);

          return {
            client: client
              ? { email: client.email, id: client.id, name: client.name }
              : undefined,
            comparison:
              previousPeriod && previous
                ? { period: previousPeriod, summary: previous.summary }
                : null,
            kind: "invoice-analysis",
            message: `Analyzed ${current.issuedRows.length} invoice${current.issuedRows.length === 1 ? "" : "s"} for ${period.label}.`,
            period,
            summary: current.summary,
          };
        }),
      inputSchema: z.object({
        clientId: z.string().uuid().optional(),
        clientName: z.string().trim().optional(),
        comparePrevious: z.boolean().optional(),
        from: z.string().trim().optional(),
        period: invoicePeriodSchema.optional(),
        to: z.string().trim().optional(),
      }),
    }),
  };
}
