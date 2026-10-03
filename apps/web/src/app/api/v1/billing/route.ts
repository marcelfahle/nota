import { z } from "zod";

import { json, error as apiError, requireAuth } from "@/lib/api-response";
import { billingStatus } from "@/lib/billing";
import { performBillingAction } from "@/lib/billing-actions";
import { getInsufficientPermissionsError } from "@/lib/roles";

export async function GET(request: Request) {
  const result = await requireAuth(request);
  if ("error" in result) {
    return result.error;
  }
  return json({ data: await billingStatus(result.auth.org.id) });
}

export async function POST(request: Request) {
  const result = await requireAuth(request);
  if ("error" in result) {
    return result.error;
  }
  const input = z
    .object({ action: z.enum(["connect", "disconnect", "refresh", "month", "year", "portal"]) })
    .safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return apiError("Invalid billing action", 400);
  }
  const { org, role, user } = result.auth;
  try {
    return json({
      data: await performBillingAction(
        { email: user.email, orgId: org.id, role, userId: user.id },
        input.data.action,
      ),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Billing action failed";
    return apiError(message, message === getInsufficientPermissionsError() ? 403 : 409);
  }
}
