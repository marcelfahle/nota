import { z } from "zod";

import {
  apiInvoicePayloadSchema,
  calculateInvoiceTotals,
  canCreateInvoiceFromApi,
  createNextInvoiceNumber,
  getInvoiceDetail,
  getInvoiceList,
  getInvoiceValidationError,
  getScopedClient,
  normalizeInvoicePayload,
} from "@/lib/api-invoices";
import { error, json, paginated, requireAuth } from "@/lib/api-response";
import { db } from "@/lib/db";
import { activityLog, invoices, lineItems } from "@/lib/db/schema";
import { getInsufficientPermissionsError } from "@/lib/roles";

const invoiceListQuerySchema = z.object({
  client_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  status: z.enum(["draft", "sent", "paid", "overdue", "cancelled"]).optional(),
});

export async function GET(request: Request) {
  const authResult = await requireAuth(request);
  if ("error" in authResult) {
    return authResult.error;
  }

  const url = new URL(request.url);
  const queryResult = invoiceListQuerySchema.safeParse({
    client_id: url.searchParams.get("client_id") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    per_page: url.searchParams.get("per_page") ?? undefined,
    search: url.searchParams.get("search") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
  });

  if (!queryResult.success) {
    return error(queryResult.error.issues[0]?.message ?? "Invalid query parameters");
  }

  const result = await getInvoiceList(authResult.auth.org.id, {
    clientId: queryResult.data.client_id ?? null,
    page: queryResult.data.page,
    perPage: queryResult.data.per_page,
    search: queryResult.data.search ?? null,
    status: queryResult.data.status ?? null,
  });

  return paginated(result.data, result.pagination);
}

export async function POST(request: Request) {
  const authResult = await requireAuth(request);
  if ("error" in authResult) {
    return authResult.error;
  }

  if (!canCreateInvoiceFromApi(authResult.auth.role)) {
    return error(getInsufficientPermissionsError(), 403);
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

  const insertedInvoice = await db.transaction(async (tx) => {
    const number = await createNextInvoiceNumber(tx, authResult.auth.org.id);
    const [invoice] = await tx
      .insert(invoices)
      .values({
        ...invoiceData,
        ...totals,
        number,
        orgId: authResult.auth.org.id,
        userId: authResult.auth.user.id,
      })
      .returning({ id: invoices.id });

    await tx.insert(lineItems).values(
      items.map((item, index) => ({
        amount: (item.quantity * item.unitPrice).toFixed(2),
        description: item.description,
        invoiceId: invoice.id,
        quantity: item.quantity.toFixed(2),
        sortOrder: index,
        unitPrice: item.unitPrice.toFixed(2),
      })),
    );

    await tx.insert(activityLog).values({
      action: "created",
      invoiceId: invoice.id,
    });

    return invoice;
  });

  const invoice = await getInvoiceDetail(authResult.auth.org.id, insertedInvoice.id);
  if (!invoice) {
    return error("Invoice could not be loaded", 500);
  }

  return json({ data: invoice }, 201);
}
