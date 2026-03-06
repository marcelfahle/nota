import { z } from "zod";

import {
  apiInvoicePayloadSchema,
  createInvoiceFromApi,
  getInvoiceList,
  getInvoiceValidationError,
  normalizeInvoicePayload,
} from "@/lib/api-invoices";
import { error, json, paginated, requireAuth } from "@/lib/api-response";

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

  const serviceResult = await createInvoiceFromApi(authResult.auth, result.data);
  if ("error" in serviceResult) {
    return error(serviceResult.error, serviceResult.status);
  }

  return json({ data: serviceResult.invoice, warning: serviceResult.warning }, 201);
}
