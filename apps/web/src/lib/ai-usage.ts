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
    inputPerMillion: 3,
    label: "Claude Sonnet 5.5",
    outputPerMillion: 15,
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
  return value in MODEL_PRICES;
}

export async function resolveModel(feature: ModelFeature, orgId?: string | null) {
  const config = FEATURE_CONFIG[feature];
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
  if (configured && isAllowedModel(configured)) {
    return configured;
  }
  const environment = process.env[config.env];
  return environment && isAllowedModel(environment) ? environment : config.fallback;
}

export async function recordAiUsage(context: UsageContext, usage: ModelUsage = {}) {
  await db.insert(aiUsage).values({
    feature: context.feature,
    inputTokens: usage.inputTokens ?? 0,
    modelId: context.modelId,
    orgId: context.orgId ?? null,
    outputTokens: usage.outputTokens ?? 0,
    userId: context.userId ?? null,
  });
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
}) {
  if (input.feature === "parallel-extract" || input.feature === "parallel-search") {
    return 0.001;
  }
  const price = MODEL_PRICES[input.modelId as AllowedModel];
  return price
    ? (input.inputTokens * price.inputPerMillion + input.outputTokens * price.outputPerMillion) /
        1_000_000
    : 0;
}
