import type { UIMessage } from "ai";
import { and, desc, eq, exists, inArray, sql } from "drizzle-orm";

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

type ChatPageContext = NonNullable<typeof chatMessages.$inferSelect.pageContext>;
export type ChatMetadata = {
  mentions?: ChatPageContext["mentions"];
  rating?: "up" | "down" | null;
};
const day = 24 * 60 * 60 * 1000;
function ownedBy(owner: ChatOwner) {
  return and(eq(chatThreads.orgId, owner.orgId), eq(chatThreads.userId, owner.userId));
}

export async function findChatThread(owner: ChatOwner, id: string) {
  const [thread] = await db
    .select()
    .from(chatThreads)
    .where(and(ownedBy(owner), eq(chatThreads.id, id)));
  return thread;
}

export async function listChatThreads(owner: ChatOwner) {
  const firstMessage = db
    .select({
      title:
        sql<string>`left(jsonb_path_query_first(${chatMessages.parts}, '$[*] ? (@.type == "text").text') #>> '{}', 90)`.as(
          "title",
        ),
    })
    .from(chatMessages)
    .where(and(eq(chatMessages.threadId, chatThreads.id), eq(chatMessages.role, "user")))
    .orderBy(chatMessages.createdAt)
    .limit(1)
    .as("first_message");
  return db
    .select({ id: chatThreads.id, title: firstMessage.title, updatedAt: chatThreads.updatedAt })
    .from(chatThreads)
    .innerJoinLateral(firstMessage, sql`true`)
    .where(ownedBy(owner))
    .orderBy(desc(chatThreads.updatedAt));
}

export async function rateChatReply(
  owner: ChatOwner,
  messageId: string,
  rating: "up" | "down" | null,
) {
  const [row] = await db
    .update(chatMessages)
    .set({ rating })
    .where(
      and(
        eq(chatMessages.id, messageId),
        eq(chatMessages.role, "assistant"),
        exists(
          db
            .select({ id: chatThreads.id })
            .from(chatThreads)
            .where(and(ownedBy(owner), eq(chatThreads.id, chatMessages.threadId))),
        ),
      ),
    )
    .returning({ id: chatMessages.id });
  return Boolean(row);
}

export async function getChatThread(owner: ChatOwner, startNew = false) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${owner.orgId}:${owner.userId}`}))`,
    );
    const [existing] = await tx
      .select()
      .from(chatThreads)
      .where(ownedBy(owner))
      .orderBy(desc(chatThreads.updatedAt), desc(chatThreads.createdAt))
      .limit(1);
    if (existing) {
      if (!startNew && Date.now() - existing.updatedAt.getTime() < day) {
        return existing;
      }
      const [message] = await tx
        .select({ id: chatMessages.id })
        .from(chatMessages)
        .where(eq(chatMessages.threadId, existing.id))
        .limit(1);
      if (!message) {
        return existing;
      }
    }
    const [created] = await tx.insert(chatThreads).values(owner).returning();
    return created;
  });
}

export async function loadChatMessages(
  threadId: string,
  limit?: number,
): Promise<Array<UIMessage<ChatMetadata>>> {
  const query = db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.threadId, threadId))
    .orderBy(desc(chatMessages.createdAt));
  const rows = await (limit ? query.limit(limit) : query);
  return rows.reverse().map((row) => ({
    id: row.id,
    metadata: { mentions: row.pageContext?.mentions, rating: row.rating },
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
  pageContext?: ChatPageContext,
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
