import { error, json, requireAuth } from "@/lib/api-response";
import { disconnectApp } from "@/lib/connected-apps";

/** Revoke only the OAuth connection that authenticated this request. */
export async function DELETE(request: Request) {
  const result = await requireAuth(request);
  if ("error" in result) {
    return result.error;
  }
  if (!result.auth.oauthClientId) {
    return error("This endpoint requires an OAuth session.", 400);
  }
  await disconnectApp(result.auth.user.id, result.auth.oauthClientId);
  return json({ data: { disconnected: true } });
}
