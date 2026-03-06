import { sendInvoiceFromApi } from "@/lib/api-invoice-actions";
import { error, json, requireAuth } from "@/lib/api-response";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth(request);
  if ("error" in authResult) {
    return authResult.error;
  }

  const { id } = await params;
  const result = await sendInvoiceFromApi(authResult.auth, id);
  if ("error" in result) {
    return error(result.error, result.status);
  }

  return json({ data: result.invoice, warning: result.warning });
}
