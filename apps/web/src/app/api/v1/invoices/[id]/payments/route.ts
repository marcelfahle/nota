import { z } from "zod";

import { recordInvoicePaymentFromApi } from "@/lib/api-invoice-actions";
import { error, json, requireAuth } from "@/lib/api-response";

const paymentSchema = z.object({
  amount: z.union([z.number().finite(), z.string().trim().min(1)]),
  method: z.enum(["bank_transfer", "other"]).default("bank_transfer"),
  note: z.string().trim().optional(),
  receivedAt: z.coerce.date().optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth(request);
  if ("error" in authResult) {
    return authResult.error;
  }
  const parsed = paymentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return error(parsed.error.issues[0]?.message ?? "Invalid payment");
  }
  const { id } = await params;
  const result = await recordInvoicePaymentFromApi(authResult.auth, id, parsed.data);
  if ("error" in result) {
    return error(result.error, result.status);
  }
  return json({ data: result.invoice });
}
