import Link from "next/link";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  adminActionLabel,
  auditDetails,
  auditWorkspaceName,
  type AdminAuditEntry,
} from "@/lib/admin-audit";

function date(value: Date) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(value);
}

/** What operators did, newest first. The workspace column is dropped on a workspace's own page. */
export function AdminAuditTable({
  entries,
  showWorkspace = true,
}: {
  entries: Array<AdminAuditEntry>;
  showWorkspace?: boolean;
}) {
  return (
    <div className="rounded-md border" data-testid="admin-audit">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Admin</TableHead>
            <TableHead>Action</TableHead>
            {showWorkspace ? <TableHead>Workspace</TableHead> : null}
            <TableHead>Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.length > 0 ? (
            entries.map((entry) => {
              const workspaceName = auditWorkspaceName(entry);
              return (
                <TableRow key={entry.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {date(entry.createdAt)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{entry.adminEmail}</TableCell>
                  <TableCell className="font-medium">{adminActionLabel(entry.action)}</TableCell>
                  {showWorkspace ? (
                    <TableCell>
                      {entry.targetOrgId ? (
                        <Link
                          className="underline-offset-4 hover:underline"
                          href={`/admin/workspaces/${entry.targetOrgId}`}
                        >
                          {workspaceName}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">
                          {workspaceName ? `${workspaceName} (deleted)` : "—"}
                        </span>
                      )}
                    </TableCell>
                  ) : null}
                  <TableCell className="text-muted-foreground">
                    {auditDetails(entry) ?? "—"}
                  </TableCell>
                </TableRow>
              );
            })
          ) : (
            <TableRow>
              <TableCell className="text-muted-foreground" colSpan={showWorkspace ? 5 : 4}>
                No admin actions recorded.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
