import { getActiveUserOrNull } from "@/lib/auth";
import { handleClientImport } from "@/lib/client-import-http";

export async function POST(request: Request) {
  const auth = await getActiveUserOrNull();
  if (!auth) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ error: "Invalid request origin" }, { status: 403 });
  }
  return handleClientImport(request, auth);
}
