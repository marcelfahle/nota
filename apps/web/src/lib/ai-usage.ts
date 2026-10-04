/* eslint-disable no-console */
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { aiModelSettings, aiUsage, aiWorkspaceModelOverrides } from "@/lib/db/schema";

export const MODEL_FEATURES = ["chat", "reader-site-facts", "reader-location"] as const;
export type ModelFeature = (typeof MODEL_FEATURES)[number];
export type UsageFeature = ModelFeature | "parallel-extract" | "parallel-search";

export const MODEL_PRICES = {
  "claude-haiku-4-5-20251001": {
    inputPerMillion: 1,
    label: "Claude Haiku 4.5",
    outputPerMillion: 5,
  },
  "claude-sonnet-4-5-20250929": {
    inputPerMillion: 3,
    label: "Claude Sonnet 4.5",
    outputPerMillion: 15,
  },
  "claude-sonnet-5-5": {
    inputPerMillion: 2,
    label: "Claude Sonnet 5.5",
    outputPerMillion: 10,
  },
} as const;

export type AllowedModel = keyof typeof MODEL_PRICES;
export const ALLOWED_MODELS = Object.keys(MODEL_PRICES) as Array<AllowedModel>;

export const FEATURE_CONFIG: Record<
  ModelFeature,
  {
    env: "NOTA_CHAT_MODEL" | "NOTA_READER_MODEL";
    fallback: AllowedModel;
    label: string;
    source: string;
  }
> = {
  chat: {
    env: "NOTA_CHAT_MODEL",
    fallback: "claude-sonnet-5-5",
    label: "In-app chat",
    source: "apps/web/src/app/api/chat/route.ts",
  },
  "reader-location": {
    env: "NOTA_READER_MODEL",
    fallback: "claude-haiku-4-5-20251001",
    label: "Website reader · location",
    source: "apps/web/src/lib/site-reader/model.ts",
  },
  "reader-site-facts": {
    env: "NOTA_READER_MODEL",
    fallback: "claude-haiku-4-5-20251001",
    label: "Website reader · site facts",
    source: "apps/web/src/lib/site-reader/model.ts",
  },
};

type UsageContext = {
  feature: UsageFeature;
  modelId: string;
  orgId?: string | null;
  userId?: string | null;
};

type ModelUsage = { inputTokens?: number; outputTokens?: number };

export function isAllowedModel(value: string): value is AllowedModel {
  return Object.hasOwn(MODEL_PRICES, value);
}

function fallbackModel(feature: ModelFeature) {
  const config = FEATURE_CONFIG[feature];
  const environment = process.env[config.env];
  return environment && isAllowedModel(environment) ? environment : config.fallback;
}

export async function resolveModel(feature: ModelFeature, orgId?: string | null) {
  try {
    return await configuredModel(feature, orgId);
  } catch (error) {
    // Model settings are an operator convenience. If they cannot be read
    // (database blip, migration not applied yet) the feature still runs.
    console.error("[ai-usage] could not read model settings, using the fallback", error);
    return fallbackModel(feature);
  }
}

async function configuredModel(feature: ModelFeature, orgId?: string | null) {
  const [workspaceOverride, globalSetting] = await Promise.all([
    orgId
      ? db
          .select({ modelId: aiWorkspaceModelOverrides.modelId })
          .from(aiWorkspaceModelOverrides)
          .where(
            and(
              eq(aiWorkspaceModelOverrides.orgId, orgId),
              eq(aiWorkspaceModelOverrides.feature, feature),
            ),
          )
          .limit(1)
      : Promise.resolve([]),
    db
      .select({ modelId: aiModelSettings.modelId })
      .from(aiModelSettings)
      .where(eq(aiModelSettings.feature, feature))
      .limit(1),
  ]);
  const configured = workspaceOverride[0]?.modelId ?? globalSetting[0]?.modelId;
  return configured && isAllowedModel(configured) ? configured : fallbackModel(feature);
}

export async function recordAiUsage(context: UsageContext, usage: ModelUsage = {}) {
  const values = {
    feature: context.feature,
    id: crypto.randomUUID(),
    inputTokens: usage.inputTokens ?? 0,
    modelId: context.modelId,
    orgId: context.orgId ?? null,
    outputTokens: usage.outputTokens ?? 0,
    userId: context.userId ?? null,
  };
  try {
    await db.insert(aiUsage).values(values).onConflictDoNothing({ target: aiUsage.id });
  } catch {
    try {
      await db.insert(aiUsage).values(values).onConflictDoNothing({ target: aiUsage.id });
    } catch (error) {
      // Counting is bookkeeping: losing a row must not break chat or a website read.
      console.error("[ai-usage] failed to record model usage after retry", error);
    }
  }
}

export async function trackedModelCall<T>(
  context: Omit<UsageContext, "modelId"> & { feature: ModelFeature },
  call: (tracking: {
    modelId: AllowedModel;
    onFinish: (event: { totalUsage: ModelUsage }) => Promise<void>;
  }) => T | Promise<T>,
): Promise<T> {
  const modelId = await resolveModel(context.feature, context.orgId);
  return call({
    modelId,
    onFinish: ({ totalUsage }) => recordAiUsage({ ...context, modelId }, totalUsage),
  });
}

export function estimatedCost(input: {
  feature: string;
  inputTokens: number;
  modelId: string;
  outputTokens: number;
  requests?: number;
}) {
  // Parallel's list prices as read on 2026-10-04: about $0.001 per extracted
  // URL and $0.005 per search. Their rows carry the unit count as input tokens.
  if (input.feature === "parallel-extract") {
    return 0.001 * input.inputTokens;
  }
  if (input.feature === "parallel-search") {
    return 0.005 * input.inputTokens;
  }
  const price = MODEL_PRICES[input.modelId as AllowedModel];
  return price
    ? (input.inputTokens * price.inputPerMillion + input.outputTokens * price.outputPerMillion) /
        1_000_000
    : 0;
}
