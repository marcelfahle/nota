import Link from "next/link";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAdminOverview } from "@/lib/admin-data";
import { formatEstimatedCost } from "@/lib/admin-format";

function date(value: Date | null) {
  return value ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(value) : "Never";
}

export default async function AdminAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const [{ totals, workspaces }, params] = await Promise.all([getAdminOverview(), searchParams]);
  if (params.sort === "ai-cost") {
    workspaces.sort((left, right) => right.aiCost - left.aiCost);
  }
  const summary = [
    ["Workspaces", totals.workspaces],
    ["Users", totals.users],
    ["Invoices sent this month", totals.invoicesSent],
    ["AI requests this month", totals.aiRequests],
    ["Estimated AI cost this month", formatEstimatedCost(totals.aiCost)],
  ];

  return (
    <div className="space-y-8">
      <div>
        <p className="nota-label mb-2">Private operations</p>
        <h1>Accounts</h1>
      </div>

      <dl className="grid border-y sm:grid-cols-2 lg:grid-cols-5">
        {summary.map(([label, value]) => (
          <div className="border-b px-3 py-4 last:border-b-0 sm:border-r sm:border-b-0" key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 font-mono text-lg font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="workspaces-heading" className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold" id="workspaces-heading">
              Workspaces
            </h2>
            <p className="text-sm text-muted-foreground">Read-only account and usage state.</p>
          </div>
          <Link className="text-sm underline underline-offset-4" href="/admin?sort=ai-cost">
            Sort by AI cost
          </Link>
        </div>
        <div className="rounded-md border" data-testid="admin-workspaces">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Workspace</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last active</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Clients</TableHead>
                <TableHead>Invoices</TableHead>
                <TableHead>AI requests / estimated cost</TableHead>
                <TableHead>Plan / Stripe</TableHead>
                <TableHead>Override</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workspaces.map((workspace) => (
                <TableRow key={workspace.id}>
                  <TableCell>
                    <Link
                      className="block font-medium underline-offset-4 hover:underline"
                      href={`/admin/workspaces/${workspace.id}`}
                    >
                      {workspace.name}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {workspace.ownerEmail ?? "No owner"}
                    </span>
                  </TableCell>
                  <TableCell>{date(workspace.createdAt)}</TableCell>
                  <TableCell>{date(workspace.lastActive)}</TableCell>
                  <TableCell>{workspace.memberCount}</TableCell>
                  <TableCell>{workspace.clientCount}</TableCell>
                  <TableCell>
                    {workspace.invoiceCount}{" "}
                    <span className="text-xs text-muted-foreground">
                      ({workspace.invoicesLast30Days} / 30d)
                    </span>
                  </TableCell>
                  <TableCell>
                    {workspace.aiRequests} · {formatEstimatedCost(workspace.aiCost)}
                  </TableCell>
                  <TableCell>
                    {workspace.plan} / {workspace.stripeStatus ?? "none"}
                  </TableCell>
                  <TableCell className="max-w-56 truncate text-xs">
                    {workspace.overrides.length > 0
                      ? workspace.overrides
                          .map((item) => `${item.feature}: ${item.modelId}`)
                          .join(", ")
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
