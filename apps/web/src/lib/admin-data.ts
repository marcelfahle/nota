import { and, asc, count, desc, eq, gte, lt, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { notFound } from "next/navigation";

import {
  estimatedCost,
  FEATURE_CONFIG,
  MODEL_FEATURES,
  resolveModel,
  type ModelFeature,
} from "@/lib/ai-usage";
import { requireSuperAdmin } from "@/lib/auth";
import { buildChatSystemPrompt, createChatTools, type ChatToolContext } from "@/lib/chat-tools";
import { db } from "@/lib/db";
import {
  activityLog,
  aiModelChanges,
  aiModelSettings,
  aiUsage,
  aiWorkspaceModelOverrides,
  clients,
  invoices,
  invoiceSends,
  orgMembers,
  orgs,
  sessions,
  users,
} from "@/lib/db/schema";
import { LOCATION_READER_SYSTEM_PROMPT, SITE_READER_SYSTEM_PROMPT } from "@/lib/site-reader/model";

function monthRange(offset = 0) {
  const now = new Date();
  return {
    end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 1)),
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1)),
  };
}

function summarizeUsage(
  rows: Array<{
    feature: string;
    inputTokens: number;
    modelId: string;
    orgId: string | null;
    outputTokens: number;
  }>,
) {
  const byOrg = new Map<string, { cost: number; requests: number }>();
  let cost = 0;
  for (const row of rows) {
    const rowCost = estimatedCost(row);
    cost += rowCost;
    if (row.orgId) {
      const current = byOrg.get(row.orgId) ?? { cost: 0, requests: 0 };
      current.cost += rowCost;
      current.requests += 1;
      byOrg.set(row.orgId, current);
    }
  }
  return { byOrg, cost, requests: rows.length };
}

export async function getAdminOverview() {
  await requireSuperAdmin();
  const month = monthRange();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
  const workspace = alias(orgs, "workspace");
  const [workspaceRows, usageRows, overrides, [userTotal], [sentTotal]] = await Promise.all([
    db
      .select({
        clientCount: sql<number>`(select count(*)::int from ${clients} c where c.org_id = "workspace"."id")`,
        createdAt: workspace.createdAt,
        id: workspace.id,
        invoiceCount: sql<number>`(select count(*)::int from ${invoices} i where i.org_id = "workspace"."id" and i.kind = 'invoice')`,
        invoicesLast30Days: sql<number>`(select count(*)::int from ${invoices} i where i.org_id = "workspace"."id" and i.kind = 'invoice' and i.created_at >= ${thirtyDaysAgo})`,
        lastActive: sql<Date | null>`(select max(s.updated_at) from ${sessions} s inner join ${orgMembers} om on om.user_id = s.user_id where om.org_id = "workspace"."id")`,
        memberCount: sql<number>`(select count(*)::int from ${orgMembers} om where om.org_id = "workspace"."id")`,
        name: workspace.name,
        ownerEmail: sql<
          string | null
        >`(select u.email from ${orgMembers} om inner join ${users} u on u.id = om.user_id where om.org_id = "workspace"."id" and om.role = 'owner' order by om.created_at asc limit 1)`,
        plan: workspace.plan,
        stripeStatus: workspace.stripeSubscriptionStatus,
      })
      .from(workspace)
      .orderBy(asc(workspace.name)),
    db
      .select({
        feature: aiUsage.feature,
        inputTokens: aiUsage.inputTokens,
        modelId: aiUsage.modelId,
        orgId: aiUsage.orgId,
        outputTokens: aiUsage.outputTokens,
      })
      .from(aiUsage)
      .where(and(gte(aiUsage.createdAt, month.start), lt(aiUsage.createdAt, month.end))),
    db.select().from(aiWorkspaceModelOverrides),
    db.select({ count: count() }).from(users).where(eq(users.isSuperAdmin, false)),
    db
      .select({ count: count() })
      .from(invoiceSends)
      .where(
        and(
          gte(invoiceSends.month, month.start.toISOString().slice(0, 10)),
          lt(invoiceSends.month, month.end.toISOString().slice(0, 10)),
        ),
      ),
  ]);
  const usage = summarizeUsage(usageRows);
  const overridesByOrg = new Map<string, Array<{ feature: string; modelId: string }>>();
  for (const override of overrides) {
    const list = overridesByOrg.get(override.orgId) ?? [];
    list.push({ feature: override.feature, modelId: override.modelId });
    overridesByOrg.set(override.orgId, list);
  }
  return {
    totals: {
      aiCost: usage.cost,
      aiRequests: usage.requests,
      invoicesSent: sentTotal?.count ?? 0,
      users: userTotal?.count ?? 0,
      workspaces: workspaceRows.length,
    },
    workspaces: workspaceRows.map((workspace) => ({
      ...workspace,
      aiCost: usage.byOrg.get(workspace.id)?.cost ?? 0,
      aiRequests: usage.byOrg.get(workspace.id)?.requests ?? 0,
      overrides: overridesByOrg.get(workspace.id) ?? [],
    })),
  };
}

export async function getAdminWorkspace(orgId: string) {
  await requireSuperAdmin();
  const [workspace] = await db.select().from(orgs).where(eq(orgs.id, orgId)).limit(1);
  if (!workspace) {
    notFound();
  }
  const [members, activity, overrides] = await Promise.all([
    db
      .select({
        createdAt: orgMembers.createdAt,
        email: users.email,
        name: users.name,
        role: orgMembers.role,
      })
      .from(orgMembers)
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .where(eq(orgMembers.orgId, orgId))
      .orderBy(asc(orgMembers.createdAt)),
    db
      .select({
        action: activityLog.action,
        createdAt: activityLog.createdAt,
        invoiceNumber: invoices.number,
        source: activityLog.source,
      })
      .from(activityLog)
      .innerJoin(invoices, eq(invoices.id, activityLog.invoiceId))
      .where(eq(invoices.orgId, orgId))
      .orderBy(desc(activityLog.createdAt))
      .limit(12),
    db.select().from(aiWorkspaceModelOverrides).where(eq(aiWorkspaceModelOverrides.orgId, orgId)),
  ]);
  return { activity, members, overrides, workspace };
}

export async function getAdminAi() {
  await requireSuperAdmin();
  const lastMonth = monthRange(-1);
  const thisMonth = monthRange();
  const [settings, changes, workspaces, overrides, currentModels, thisMonthRows, lastMonthRows] =
    await Promise.all([
      db.select().from(aiModelSettings),
      db
        .select({
          changedAt: aiModelChanges.changedAt,
          changedBy: users.email,
          feature: aiModelChanges.feature,
          modelId: aiModelChanges.modelId,
          orgId: aiModelChanges.orgId,
        })
        .from(aiModelChanges)
        .innerJoin(users, eq(users.id, aiModelChanges.changedBy))
        .orderBy(desc(aiModelChanges.changedAt))
        .limit(20),
      db.select({ id: orgs.id, name: orgs.name }).from(orgs).orderBy(asc(orgs.name)),
      db.select().from(aiWorkspaceModelOverrides),
      Promise.all(
        MODEL_FEATURES.map(async (feature) => [feature, await resolveModel(feature)] as const),
      ),
      db
        .select({
          feature: aiUsage.feature,
          inputTokens: aiUsage.inputTokens,
          modelId: aiUsage.modelId,
          orgId: aiUsage.orgId,
          outputTokens: aiUsage.outputTokens,
        })
        .from(aiUsage)
        .where(and(gte(aiUsage.createdAt, thisMonth.start), lt(aiUsage.createdAt, thisMonth.end))),
      db
        .select({
          feature: aiUsage.feature,
          inputTokens: aiUsage.inputTokens,
          modelId: aiUsage.modelId,
          orgId: aiUsage.orgId,
          outputTokens: aiUsage.outputTokens,
        })
        .from(aiUsage)
        .where(and(gte(aiUsage.createdAt, lastMonth.start), lt(aiUsage.createdAt, lastMonth.end))),
    ]);

  const exampleContext = {
    org: {
      businessName: "Example workspace",
      defaultCurrency: "EUR",
      invoicePrefix: "INV",
      name: "Example workspace",
    },
    role: "owner",
    user: { name: "Workspace owner" },
  } as ChatToolContext;
  const chatTools = createChatTools(exampleContext);
  const prompts: Record<ModelFeature, string> = {
    chat: buildChatSystemPrompt(exampleContext, { clients: [], recentInvoices: [] }),
    "reader-location": LOCATION_READER_SYSTEM_PROMPT,
    "reader-site-facts": SITE_READER_SYSTEM_PROMPT,
  };
  const settingsByFeature = new Map(settings.map((setting) => [setting.feature, setting]));
  return {
    changes,
    features: MODEL_FEATURES.map((feature) => ({
      ...FEATURE_CONFIG[feature],
      feature,
      modelId: Object.fromEntries(currentModels)[feature],
      prompt: prompts[feature],
      setting: settingsByFeature.get(feature) ?? null,
      tools:
        feature === "chat"
          ? Object.entries(chatTools).map(([name, tool]) => ({
              description: tool.description ?? "",
              name,
            }))
          : [],
    })),
    lastMonth: summarizeUsage(lastMonthRows),
    overrides,
    thisMonth: summarizeUsage(thisMonthRows),
    workspaces,
  };
}
