import { z } from "zod";

import { error, json, requireAuth } from "@/lib/api-response";
import { changeInvoiceDueDate, getInvoiceDetail } from "@/lib/invoice-service";
import { getInsufficientPermissionsError } from "@/lib/roles";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth(request);
  if ("error" in authResult) {
    return authResult.error;
  }
  const payload = z
    .object({ dueAt: z.iso.date() })
    .safeParse(await request.json().catch(() => null));
  if (!payload.success) {
    return error("Provide a valid dueAt date in YYYY-MM-DD format.");
  }
  const { id } = await params;
  const { org, role, user } = authResult.auth;
  const result = await changeInvoiceDueDate(
    { orgId: org.id, role, userId: user.id },
    id,
    payload.data.dueAt,
  );
  if ("error" in result) {
    const statuses: Record<string, number> = {
      [getInsufficientPermissionsError()]: 403,
      "Invoice changed. Refresh and try again.": 409,
      "Invoice not found": 404,
    };
    return error(result.error, statuses[result.error] ?? 400);
  }
  return json({ data: await getInvoiceDetail(org.id, id) });
}
