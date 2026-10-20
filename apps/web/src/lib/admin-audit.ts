import { desc, eq } from "drizzle-orm";

import { VIEW_AS_TTL_SECONDS } from "@/lib/admin-view-as";
import { db } from "@/lib/db";
import { adminAuditLog, orgs, users } from "@/lib/db/schema";

export const ADMIN_ACTIONS = {
  "model.global": "Changed global model",
  "model.workspace": "Changed workspace model",
  "password.changed": "Set permanent password",
  "view-as.exited": "Stopped viewing as owner",
  "view-as.started": "Viewed as owner",
  "workspace.deactivated": "Deactivated workspace",
  "workspace.deleted": "Deleted workspace",
  "workspace.reactivated": "Reactivated workspace",
} as const;

export type AdminAction = keyof typeof ADMIN_ACTIONS;

type Executor = Pick<typeof db, "insert">;

/** One row per admin action. Pass the transaction when the action runs in one. */
export async function recordAdminAction(
  entry: {
    action: AdminAction;
    adminUserId: string;
    expiresAt?: Date | null;
    metadata?: Record<string, unknown>;
    targetOrgId?: string | null;
    targetUserId?: string | null;
  },
  executor: Executor = db,
) {
  await executor.insert(adminAuditLog).values({
    action: entry.action,
    adminUserId: entry.adminUserId,
    expiresAt: entry.expiresAt ?? null,
    metadata: entry.metadata ?? null,
    targetOrgId: entry.targetOrgId ?? null,
    targetUserId: entry.targetUserId ?? null,
  });
}

function auditQuery() {
  return db
    .select({
      action: adminAuditLog.action,
      adminEmail: users.email,
      createdAt: adminAuditLog.createdAt,
      expiresAt: adminAuditLog.expiresAt,
      id: adminAuditLog.id,
      metadata: adminAuditLog.metadata,
      targetOrgId: adminAuditLog.targetOrgId,
      workspaceName: orgs.name,
    })
    .from(adminAuditLog)
    .innerJoin(users, eq(users.id, adminAuditLog.adminUserId))
    .leftJoin(orgs, eq(orgs.id, adminAuditLog.targetOrgId))
    .orderBy(desc(adminAuditLog.createdAt));
}

export type AdminAuditEntry = Awaited<ReturnType<typeof listAdminAudit>>[number];

export function listAdminAudit(limit = 50) {
  return auditQuery().limit(limit);
}

export function listWorkspaceAudit(orgId: string, limit = 10) {
  return auditQuery().where(eq(adminAuditLog.targetOrgId, orgId)).limit(limit);
}

export function adminActionLabel(action: string) {
  return action in ADMIN_ACTIONS ? ADMIN_ACTIONS[action as AdminAction] : action;
}

/** The workspace an entry concerns, falling back to the name kept when it was deleted. */
export function auditWorkspaceName(entry: Pick<AdminAuditEntry, "metadata" | "workspaceName">) {
  const kept = entry.metadata?.workspaceName;
  return entry.workspaceName ?? (typeof kept === "string" ? kept : null);
}

/** A short, human line from the metadata an action recorded. */
export function auditDetails(entry: Pick<AdminAuditEntry, "action" | "expiresAt" | "metadata">) {
  const data = entry.metadata ?? {};
  switch (entry.action) {
    case "model.global":
    case "model.workspace":
      return `${data.feature} → ${data.modelId ?? "fallback"}`;
    case "view-as.started":
      return `${data.ownerEmail ? `as ${data.ownerEmail}, ` : ""}for ${VIEW_AS_TTL_SECONDS / 60} minutes`;
    case "workspace.deleted": {
      const deleted = data.deleted as Record<string, number> | undefined;
      return deleted
        ? `${deleted.invoices} invoices, ${deleted.clients} clients, ${deleted.users} users removed`
        : null;
    }
    default:
      return null;
  }
}
