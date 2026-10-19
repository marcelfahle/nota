import { ilike, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import { orgMembers, users } from "@/lib/db/schema";

/** An ILIKE pattern for a typed search, or null when nothing was typed. */
export function searchPattern(query: string | null | undefined) {
  const term = (query ?? "").trim().replaceAll(/[%_\\]/g, (char) => `\\${char}`);
  return term ? `%${term}%` : null;
}

/** The orgs table or an alias of it. */
type WorkspaceColumns = { businessName: AnyPgColumn; id: AnyPgColumn; name: AnyPgColumn };

/** Matches a member's email or name, in a subquery the overview can also select. */
export function memberMatch(workspace: WorkspaceColumns, pattern: string) {
  return sql`select u.email from ${orgMembers} om inner join ${users} u on u.id = om.user_id where om.org_id = ${workspace.id} and (u.email ilike ${pattern} or u.name ilike ${pattern}) order by om.created_at asc limit 1`;
}

/** Workspace name, business name, or any member's email or name. */
export function workspaceSearch(workspace: WorkspaceColumns, pattern: string): SQL {
  return or(
    ilike(workspace.name, pattern),
    ilike(workspace.businessName, pattern),
    sql`exists (${memberMatch(workspace, pattern)})`,
  ) as SQL;
}
