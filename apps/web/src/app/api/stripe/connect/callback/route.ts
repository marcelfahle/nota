import { getCurrentUserOrNull } from "@/lib/auth";
import { getAppEnv } from "@/lib/env";
import { canManageSettings } from "@/lib/roles";
import { finishStripeConnect } from "@/lib/stripe-connect";

export async function GET(request: Request) {
  const context = await getCurrentUserOrNull();
  const destination = new URL("/settings", getAppEnv().APP_URL);
  if (!context || !canManageSettings(context.role)) {
    return new Response("Sign in as the workspace owner and restart the Stripe connection.", {
      status: 403,
    });
  }
  const params = new URL(request.url).searchParams;
  const state = params.get("state");
  const code = params.get("code");
  if (!state || !code || params.has("error")) {
    destination.searchParams.set("connect", "cancelled");
    return Response.redirect(destination, 303);
  }
  try {
    await finishStripeConnect(context.org.id, context.user.id, state, code);
    destination.searchParams.set("connect", "success");
  } catch {
    destination.searchParams.set("connect", "failed");
  }
  return Response.redirect(destination, 303);
}
