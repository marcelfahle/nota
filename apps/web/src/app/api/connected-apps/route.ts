import { getCurrentUserOrNull } from "@/lib/auth";
import { listConnectedApps } from "@/lib/connected-apps";

export async function GET() {
  const context = await getCurrentUserOrNull();
  if (!context) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apps = await listConnectedApps(context.user.id);
  return Response.json(
    {
      apps: apps.map((app) => ({
        ...app,
        connectedAt: app.connectedAt.toISOString(),
        lastUsedAt: app.lastUsedAt.toISOString(),
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
