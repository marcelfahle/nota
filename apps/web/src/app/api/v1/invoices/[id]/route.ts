import {
  apiInvoicePayloadSchema,
  getInvoiceDetail,
  getInvoiceValidationError,
  normalizeInvoicePayload,
  updateInvoiceFromApi,
  deleteInvoiceFromApi,
} from "@/lib/api-invoices";
import { error, json, requireAuth } from "@/lib/api-response";

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

  const { id } = await params;
  const serviceResult = await updateInvoiceFromApi(authResult.auth, id, result.data);
  if ("error" in serviceResult) {
    return error(serviceResult.error, serviceResult.status);
  }

  return json({ data: serviceResult.invoice, warning: serviceResult.warning });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth(request);
  if ("error" in authResult) {
    return authResult.error;
  }

  const { id } = await params;
  const serviceResult = await deleteInvoiceFromApi(authResult.auth, id);
  if ("error" in serviceResult) {
    return error(serviceResult.error, serviceResult.status);
  }

  return json({ success: true });
}
