import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";

import type { AuthenticatedRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { activityLog, clients, invoices, lineItems, orgs } from "@/lib/db/schema";
import { canDeleteInvoice, canEditInvoice, normalizeInvoiceStatus } from "@/lib/invoice-lifecycle";
import { formatInvoiceNumber } from "@/lib/invoice-number";
import {
  canCreateInvoice,
  canDeleteInvoice as canDeleteInvoiceRole,
  canEditDraft,
} from "@/lib/roles";

export const apiLineItemSchema = z.object({
  description: z.string().trim().min(1, "Description is required"),
  quantity: z.coerce.number().positive("Quantity must be positive"),
  unitPrice: z.coerce.number().min(0, "Unit price must be non-negative"),
});

export const apiInvoicePayloadSchema = z.object({
  clientId: z.string().uuid("Invalid client"),
  currency: z.string().trim().min(1).default("EUR"),
  dueAt: z.string().min(1, "Due date is required"),
  internalNotes: z.string().trim().optional(),
  issuedAt: z.string().min(1, "Issue date is required"),
  lineItems: z.array(apiLineItemSchema).min(1, "At least one line item is required"),
  notes: z.string().trim().optional(),
  reverseCharge: z.enum(["false", "true"]).default("false"),
  taxRate: z.coerce.number().min(0).max(100).default(0),
});

export type ApiInvoicePayload = z.infer<typeof apiInvoicePayloadSchema>;

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function getInvoiceValidationError(result: z.ZodSafeParseError<ApiInvoicePayload>) {
  return result.error.issues[0]?.message ?? "Invalid invoice payload";
}

export function normalizeInvoicePayload(payload: Record<string, unknown>) {
  return {
    clientId: payload.clientId,
    currency:
      typeof payload.currency === "string" && payload.currency.trim()
        ? payload.currency
        : undefined,
    dueAt: payload.dueAt,
    internalNotes:
      typeof payload.internalNotes === "string" && payload.internalNotes.trim()
        ? payload.internalNotes
        : undefined,
    issuedAt: payload.issuedAt,
    lineItems: Array.isArray(payload.lineItems) ? payload.lineItems : (payload.lineItems ?? []),
    notes: typeof payload.notes === "string" && payload.notes.trim() ? payload.notes : undefined,
    reverseCharge:
      payload.reverseCharge === true || payload.reverseCharge === "true" ? "true" : "false",
    taxRate: payload.taxRate,
  };
}

export function calculateInvoiceTotals(
  items: Array<{ quantity: number; unitPrice: number }>,
  taxRate: number,
) {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  return {
    subtotal: subtotal.toFixed(2),
    taxAmount: taxAmount.toFixed(2),
    taxRate: taxRate.toFixed(2),
    total: total.toFixed(2),
  };
}

export async function getScopedClient(orgId: string, clientId: string) {
  const [client] = await db
    .select({
      defaultCurrency: clients.defaultCurrency,
      email: clients.email,
      id: clients.id,
      name: clients.name,
    })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.orgId, orgId)))
    .limit(1);

  return client ?? null;
}

export async function createNextInvoiceNumber(tx: DbTransaction, orgId: string) {
  const [organization] = await tx
    .select({
      invoiceDigits: orgs.invoiceDigits,
      invoicePrefix: orgs.invoicePrefix,
      invoiceSeparator: orgs.invoiceSeparator,
      nextInvoiceNumber: orgs.nextInvoiceNumber,
    })
    .from(orgs)
    .where(eq(orgs.id, orgId))
    .limit(1);

  if (!organization) {
    throw new Error("Organization not found");
  }

  const sequenceNumber = organization.nextInvoiceNumber;
  const number = formatInvoiceNumber({
    digits: organization.invoiceDigits,
    number: sequenceNumber,
    prefix: organization.invoicePrefix,
    separator: organization.invoiceSeparator,
  });

  await tx
    .update(orgs)
    .set({ nextInvoiceNumber: sequenceNumber + 1 })
    .where(eq(orgs.id, orgId));

  return number;
}

export async function getInvoiceList(
  orgId: string,
  filters: {
    clientId?: string | null;
    page: number;
    perPage: number;
    search?: string | null;
    status?: string | null;
  },
) {
  const whereClause = getInvoiceWhereClause(orgId, filters);
  const offset = (filters.page - 1) * filters.perPage;

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        client: {
          email: clients.email,
          id: clients.id,
          name: clients.name,
        },
        currency: invoices.currency,
        dueAt: invoices.dueAt,
        id: invoices.id,
        issuedAt: invoices.issuedAt,
        number: invoices.number,
        status: invoices.status,
        total: invoices.total,
      })
      .from(invoices)
      .leftJoin(clients, and(eq(clients.id, invoices.clientId), eq(clients.orgId, orgId)))
      .where(whereClause)
      .orderBy(desc(invoices.issuedAt), desc(invoices.createdAt))
      .limit(filters.perPage)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(invoices)
      .leftJoin(clients, and(eq(clients.id, invoices.clientId), eq(clients.orgId, orgId)))
      .where(whereClause)
      .limit(1),
  ]);

  return {
    data: rows,
    pagination: {
      page: filters.page,
      perPage: filters.perPage,
      total: totalRow?.total ?? 0,
    },
  };
}

function getInvoiceWhereClause(
  orgId: string,
  filters: {
    clientId?: string | null;
    search?: string | null;
    status?: string | null;
  },
) {
  const clauses = [eq(invoices.orgId, orgId)];

  if (filters.status) {
    clauses.push(eq(invoices.status, normalizeInvoiceStatus(filters.status)));
  }

  if (filters.clientId) {
    clauses.push(eq(invoices.clientId, filters.clientId));
  }

  if (filters.search) {
    const pattern = `%${filters.search}%`;
    clauses.push(
      or(
        ilike(clients.email, pattern),
        ilike(clients.name, pattern),
        ilike(invoices.number, pattern),
      )!,
    );
  }

  return and(...clauses);
}

export async function getInvoiceDetail(orgId: string, invoiceId: string) {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.orgId, orgId)))
    .limit(1);

  if (!invoice) {
    return null;
  }

  const [client, items, activities] = await Promise.all([
    db
      .select({
        defaultCurrency: clients.defaultCurrency,
        email: clients.email,
        id: clients.id,
        name: clients.name,
      })
      .from(clients)
      .where(and(eq(clients.id, invoice.clientId), eq(clients.orgId, orgId)))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db
      .select()
      .from(lineItems)
      .where(eq(lineItems.invoiceId, invoiceId))
      .orderBy(asc(lineItems.sortOrder)),
    db
      .select({
        action: activityLog.action,
        createdAt: activityLog.createdAt,
        id: activityLog.id,
        metadata: activityLog.metadata,
      })
      .from(activityLog)
      .where(eq(activityLog.invoiceId, invoiceId))
      .orderBy(desc(activityLog.createdAt)),
  ]);

  return {
    ...invoice,
    activityLog: activities,
    client,
    lineItems: items,
    status: invoice.status ?? "draft",
  };
}

export function canCreateInvoiceFromApi(role: AuthenticatedRole) {
  return canCreateInvoice(role);
}

export function canEditInvoiceFromApi(role: AuthenticatedRole, status: string | null | undefined) {
  return canEditDraft(role) && canEditInvoice(status);
}

export function canDeleteInvoiceFromApi(
  role: AuthenticatedRole,
  status: string | null | undefined,
) {
  return canDeleteInvoiceRole(role) && canDeleteInvoice(status);
}
