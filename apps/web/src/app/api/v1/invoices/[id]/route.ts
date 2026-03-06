import { and, eq } from "drizzle-orm";

import {
  apiInvoicePayloadSchema,
  calculateInvoiceTotals,
  getInvoiceDetail,
  getInvoiceValidationError,
  getScopedClient,
  normalizeInvoicePayload,
} from "@/lib/api-invoices";
import { error, json, requireAuth } from "@/lib/api-response";
import { db } from "@/lib/db";
import { activityLog, invoices, lineItems } from "@/lib/db/schema";
import {
  canDeleteInvoice as canDeleteInvoiceStatus,
  canEditInvoice as canEditInvoiceStatus,
} from "@/lib/invoice-lifecycle";
import {
  canDeleteInvoice as canDeleteInvoiceRole,
  canEditDraft,
  getInsufficientPermissionsError,
} from "@/lib/roles";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth(request);
  if ("error" in authResult) {
    return authResult.error;
  }

  const { id } = await params;
  const invoice = await getInvoiceDetail(authResult.auth.org.id, id);
  if (!invoice) {
    return error("Invoice not found", 404);
  }

  return json({ data: invoice });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth(request);
  if ("error" in authResult) {
    return authResult.error;
  }

  const { id } = await params;
  const existingInvoice = await getInvoiceDetail(authResult.auth.org.id, id);
  if (!existingInvoice) {
    return error("Invoice not found", 404);
  }

  if (!canEditDraft(authResult.auth.role)) {
    return error(getInsufficientPermissionsError(), 403);
  }

  if (!canEditInvoiceStatus(existingInvoice.status)) {
    return error("Only draft invoices can be edited", 409);
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return error("Invalid JSON body");
  }

  const result = apiInvoicePayloadSchema.safeParse(normalizeInvoicePayload(payload));
  if (!result.success) {
    return error(getInvoiceValidationError(result));
  }

  const client = await getScopedClient(authResult.auth.org.id, result.data.clientId);
  if (!client) {
    return error("Client not found", 404);
  }

  const { lineItems: items, taxRate, ...invoiceData } = result.data;
  const totals = calculateInvoiceTotals(items, taxRate);

  await db.transaction(async (tx) => {
    await tx
      .update(invoices)
      .set({
        ...invoiceData,
        ...totals,
        updatedAt: new Date(),
      })
      .where(and(eq(invoices.id, id), eq(invoices.orgId, authResult.auth.org.id)));

    await tx.delete(lineItems).where(eq(lineItems.invoiceId, id));

    await tx.insert(lineItems).values(
      items.map((item, index) => ({
        amount: (item.quantity * item.unitPrice).toFixed(2),
        description: item.description,
        invoiceId: id,
        quantity: item.quantity.toFixed(2),
        sortOrder: index,
        unitPrice: item.unitPrice.toFixed(2),
      })),
    );
  });

  const invoice = await getInvoiceDetail(authResult.auth.org.id, id);
  if (!invoice) {
    return error("Invoice could not be loaded", 500);
  }

  return json({ data: invoice });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth(request);
  if ("error" in authResult) {
    return authResult.error;
  }

  const { id } = await params;
  const invoice = await getInvoiceDetail(authResult.auth.org.id, id);
  if (!invoice) {
    return error("Invoice not found", 404);
  }

  if (!canDeleteInvoiceRole(authResult.auth.role)) {
    return error(getInsufficientPermissionsError(), 403);
  }

  if (!canDeleteInvoiceStatus(invoice.status)) {
    return error("Only draft invoices can be deleted", 409);
  }

  await db.transaction(async (tx) => {
    await tx.delete(activityLog).where(eq(activityLog.invoiceId, id));
    await tx
      .delete(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.orgId, authResult.auth.org.id)));
  });

  return json({ success: true });
}
