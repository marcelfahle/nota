import { error, json, requireAuth } from "@/lib/api-response";
import { approveProposal } from "@/lib/proposal-service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth(request);
  if ("error" in authResult) {
    return authResult.error;
  }
  const auth = authResult.auth;
  const result = await approveProposal(
    {
      orgId: auth.org.id,
      role: auth.role,
      source: auth.source,
      sourceClient: auth.sourceClient,
      userId: auth.user.id,
    },
    (await params).id,
  );
  if ("error" in result && result.error) {
    return error(result.error, 409);
  }
  return json({ data: result });
}
