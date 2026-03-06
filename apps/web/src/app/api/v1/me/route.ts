import { json, requireAuth } from "@/lib/api-response";

export async function GET(request: Request) {
  const authResult = await requireAuth(request);
  if ("error" in authResult) {
    return authResult.error;
  }

  return json({
    data: {
      org: authResult.auth.org,
      role: authResult.auth.role,
      user: {
        email: authResult.auth.user.email,
        id: authResult.auth.user.id,
        name: authResult.auth.user.name,
      },
    },
  });
}
