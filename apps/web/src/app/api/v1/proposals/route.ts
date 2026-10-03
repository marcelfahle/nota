import { z } from "zod";

import { error, json, requireAuth } from "@/lib/api-response";
import { createReminderProposal } from "@/lib/proposal-service";

const schema = z.object({
  invoiceId: z.string().uuid(),
  kind: z.literal("send_reminder"),
  reason: z.string().trim().min(1),
});

export async function POST(request: Request) {
  const authResult = await requireAuth(request);
  if ("error" in authResult) {
    return authResult.error;
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return error(parsed.error.issues[0]?.message ?? "Invalid proposal");
  }
  const auth = authResult.auth;
  const result = await createReminderProposal(
    {
      orgId: auth.org.id,
      role: auth.role,
      source: auth.source,
      sourceClient: auth.sourceClient,
      userId: auth.user.id,
    },
    parsed.data.invoiceId,
    parsed.data.reason,
  );
  if ("error" in result && result.error) {
    return error(result.error, 409);
  }
  return json({ data: result.proposal }, 201);
}
