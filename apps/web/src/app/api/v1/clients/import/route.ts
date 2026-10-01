import { requireAuth } from "@/lib/api-response";
import { handleClientImport } from "@/lib/client-import-http";

export async function POST(request: Request) {
  const result = await requireAuth(request);
  if ("error" in result) {
    return result.error;
  }
  return handleClientImport(request, result.auth);
}
