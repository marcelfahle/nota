import type { AuthenticatedRole } from "@/lib/auth";
import { billingStatus, createBillingCheckout, createBillingPortal } from "@/lib/billing";
import { canManageSettings, getInsufficientPermissionsError } from "@/lib/roles";
import { beginStripeConnect, disconnectStripe, refreshStripeConnect } from "@/lib/stripe-connect";

export async function performBillingAction(
  context: { email: string; orgId: string; role: AuthenticatedRole; userId: string },
  action: "connect" | "disconnect" | "refresh" | "month" | "year" | "portal",
) {
  if (!canManageSettings(context.role)) {
    throw new Error(getInsufficientPermissionsError());
  }
  switch (action) {
    case "connect":
      return beginStripeConnect(context.orgId, context.userId);
    case "disconnect":
      await disconnectStripe(context.orgId);
      break;
    case "refresh":
      await refreshStripeConnect(context.orgId);
      break;
    case "month":
    case "year":
      return createBillingCheckout(context.orgId, context.email, action);
    case "portal":
      return createBillingPortal(context.orgId);
  }
  return { status: await billingStatus(context.orgId) };
}
