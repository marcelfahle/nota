import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  searchParams: Promise<{ q?: string | string[]; sort?: string }>;
}) {
  const params = await searchParams;
  // A repeated ?q= arrives as an array; the first one is the search.
  const query = (Array.isArray(params.q) ? params.q[0] : params.q)?.trim() ?? "";
  const { totals, workspaces } = await getAdminOverview(query);
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
  const sortHref = query
    ? `/admin?q=${encodeURIComponent(query)}&sort=ai-cost`
    : "/admin?sort=ai-cost";

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
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold" id="workspaces-heading">
              Workspaces
            </h2>
            <p className="text-sm text-muted-foreground">Read-only account and usage state.</p>
          </div>
          <Link className="text-sm underline underline-offset-4" href={sortHref}>
            Sort by AI cost
          </Link>
        </div>
        <form action="/admin" className="flex flex-wrap items-center gap-2" role="search">
          <label className="sr-only" htmlFor="admin-search">
            Find an account
          </label>
          <Input
            autoComplete="off"
            className="max-w-sm"
            data-testid="admin-search"
            defaultValue={query}
            id="admin-search"
            name="q"
            placeholder="Email, name or workspace"
            type="search"
          />
          <Button size="sm" type="submit" variant="outline">
            Find
          </Button>
          {query ? (
            <Link
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
              href="/admin"
            >
              Show all
            </Link>
          ) : null}
        </form>
        {query ? (
          <p className="text-sm text-muted-foreground" data-testid="admin-search-summary">
            {workspaces.length === 0
              ? `Nothing matches “${query}”.`
              : `${workspaces.length} ${workspaces.length === 1 ? "workspace matches" : "workspaces match"} “${query}”.`}
          </p>
        ) : null}
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
                      {workspace.deactivatedAt ? " (deactivated)" : ""}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {workspace.ownerEmail ?? "No owner"}
                    </span>
                    {workspace.matchedEmail && workspace.matchedEmail !== workspace.ownerEmail ? (
                      <span className="block text-xs text-muted-foreground">
                        Matched member {workspace.matchedEmail}
                      </span>
                    ) : null}
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
