import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { recordAdminAction } from "@/lib/admin-audit";
import { verifyViewAs, VIEW_AS_COOKIE } from "@/lib/admin-view-as";
import { getCurrentSessionUser } from "@/lib/auth";

/**
 * Ends "view as" from the banner in the workspace shell. A plain form POST to
 * the one /admin path the proxy lets through while viewing as.
 */
export async function POST(request: Request) {
  const admin = await getCurrentSessionUser();
  if (!admin?.isSuperAdmin) {
    return new NextResponse(null, { status: 404 });
  }
  const claims = verifyViewAs((await cookies()).get(VIEW_AS_COOKIE)?.value);
  if (claims && claims.adminUserId === admin.id) {
    const entry = {
      action: "view-as.exited" as const,
      adminUserId: admin.id,
      targetOrgId: claims.orgId,
      targetUserId: claims.userId,
    };
    try {
      await recordAdminAction(entry);
    } catch {
      // The workspace or its owner was deleted meanwhile. Keep the ids in the
      // entry itself; the exit must still go through and clear the cookie.
      await recordAdminAction({
        ...entry,
        metadata: { orgId: claims.orgId, userId: claims.userId },
        targetOrgId: null,
        targetUserId: null,
      });
    }
  }
  const response = NextResponse.redirect(
    new URL(claims ? `/admin/workspaces/${claims.orgId}` : "/admin", request.url),
    303,
  );
  response.cookies.delete(VIEW_AS_COOKIE);
  return response;
}
