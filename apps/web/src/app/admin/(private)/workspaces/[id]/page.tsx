import Link from "next/link";

import { setWorkspaceModel } from "@/actions/admin";
import { AdminDeleteWorkspace } from "@/components/admin-delete-workspace";
import { Button } from "@/components/ui/button";
import { getAdminWorkspace } from "@/lib/admin-data";
import { ALLOWED_MODELS, MODEL_PRICES } from "@/lib/ai-usage";

function date(value: Date | null) {
  return value
    ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(value)
    : "—";
}

export default async function AdminWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { activity, members, overrides, workspace } = await getAdminWorkspace(id);
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="space-y-2">
        <Link
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          href="/admin"
        >
          ← Accounts
        </Link>
        <h1>{workspace.name}</h1>
        <p className="text-sm text-muted-foreground">
          {workspace.plan} plan · Stripe {workspace.stripeSubscriptionStatus ?? "not connected"} ·
          created {date(workspace.createdAt)}
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Chat model override</h2>
        <div className="divide-y rounded-md border">
          <form action={setWorkspaceModel} className="flex flex-wrap items-center gap-3 p-3">
            <input name="feature" type="hidden" value="chat" />
            <input name="orgId" type="hidden" value={workspace.id} />
            <label className="min-w-44 text-sm font-medium" htmlFor="model-chat">
              In-app chat
            </label>
            <select
              className="h-9 min-w-64 rounded-md border bg-background px-3 text-sm"
              defaultValue={
                overrides.find((override) => override.feature === "chat")?.modelId ?? "fallback"
              }
              id="model-chat"
              name="modelId"
            >
              <option value="fallback">Use global setting</option>
              {ALLOWED_MODELS.map((model) => (
                <option key={model} value={model}>
                  {MODEL_PRICES[model].label} · {model}
                </option>
              ))}
            </select>
            <Button size="sm" type="submit" variant="outline">
              Save
            </Button>
          </form>
        </div>
      </section>

      <div className="grid gap-8 md:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Members</h2>
          <ul className="divide-y rounded-md border">
            {members.map((member) => (
              <li className="p-3" key={member.email}>
                <div className="flex justify-between gap-3 text-sm">
                  <span className="font-medium">{member.name}</span>
                  <span className="text-muted-foreground">{member.role}</span>
                </div>
                <p className="mt-1 font-mono text-xs text-muted-foreground">{member.email}</p>
              </li>
            ))}
          </ul>
        </section>
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Latest activity</h2>
          <ul className="divide-y rounded-md border">
            {activity.length > 0 ? (
              activity.map((entry, index) => (
                <li
                  className="p-3 text-sm"
                  key={`${entry.invoiceNumber}-${entry.createdAt}-${index}`}
                >
                  <div className="flex justify-between gap-3">
                    <span>
                      {entry.invoiceNumber} · {entry.action}
                    </span>
                    <span className="text-xs text-muted-foreground">{entry.source}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{date(entry.createdAt)}</p>
                </li>
              ))
            ) : (
              <li className="p-3 text-sm text-muted-foreground">No activity recorded.</li>
            )}
          </ul>
        </section>
      </div>

      <AdminDeleteWorkspace
        memberCount={members.length}
        name={workspace.name}
        orgId={workspace.id}
      />
    </div>
  );
}
