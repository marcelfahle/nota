import type { UIMessage } from "ai";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { activityLog, chatMessages, chatThreads, invoices } from "@/lib/db/schema";

export type ChatOwner = { orgId: string; userId: string };

export type ChatActivity = {
  action: string;
  createdAt: string;
  id: string;
  invoiceNumber: string;
  source: string;
  sourceClient: string | null;
};

export async function getChatThread(owner: ChatOwner) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${owner.orgId}:${owner.userId}`}))`,
    );
    const [existing] = await tx
      .select()
      .from(chatThreads)
      .where(and(eq(chatThreads.orgId, owner.orgId), eq(chatThreads.userId, owner.userId)))
      .orderBy(asc(chatThreads.createdAt))
      .limit(1);
    if (existing) {
      return existing;
    }
    const [created] = await tx.insert(chatThreads).values(owner).returning();
    return created;
  });
}

export async function loadChatMessages(threadId: string, limit = 24): Promise<Array<UIMessage>> {
  const rows = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.threadId, threadId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(limit);
  return rows.reverse().map((row) => ({
    id: row.id,
    parts: row.parts as UIMessage["parts"],
    role: row.role as UIMessage["role"],
  }));
}

export async function loadChatActivity(orgId: string): Promise<Array<ChatActivity>> {
  const rows = await db
    .select({
      action: activityLog.action,
      createdAt: activityLog.createdAt,
      id: activityLog.id,
      invoiceNumber: invoices.number,
      source: activityLog.source,
      sourceClient: activityLog.sourceClient,
    })
    .from(activityLog)
    .innerJoin(invoices, eq(activityLog.invoiceId, invoices.id))
    .where(and(eq(invoices.orgId, orgId), inArray(activityLog.source, ["mcp", "cli"])))
    .orderBy(desc(activityLog.createdAt))
    .limit(8);

  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt?.toISOString() ?? new Date(0).toISOString(),
  }));
}

export async function saveChatMessage(
  threadId: string,
  message: UIMessage,
  pageContext?: { entityId?: string; route?: string },
) {
  await db
    .insert(chatMessages)
    .values({
      id: message.id,
      pageContext,
      parts: message.parts,
      role: message.role,
      threadId,
    })
    .onConflictDoNothing();
  await db.update(chatThreads).set({ updatedAt: new Date() }).where(eq(chatThreads.id, threadId));
}
