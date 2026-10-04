import { AgentConnections } from "@/components/agent-connections";
import { getCurrentUser } from "@/lib/auth";
import { listConnectedApps } from "@/lib/connected-apps";

export default async function AgentsPage() {
  const { user } = await getCurrentUser();
  const apps = await listConnectedApps(user.id);

  return (
    <AgentConnections
      initialApps={apps.map((app) => ({
        ...app,
        connectedAt: app.connectedAt.toISOString(),
        lastUsedAt: app.lastUsedAt.toISOString(),
      }))}
    />
  );
}
