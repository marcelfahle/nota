import { z } from "zod";

function createEnvGetter<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  let cached: z.infer<typeof schema> | null = null;

  return () => {
    if (!cached) {
      cached = schema.parse(process.env);
    }

    return cached;
  };
}

const nodeEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export const getDbEnv = createEnvGetter(
  z.object({
    DATABASE_URL: z.string().url("DATABASE_URL must be a valid Postgres connection URL"),
  }),
);

export const getAuthEnv = createEnvGetter(
  nodeEnvSchema.extend({
    SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  }),
);

export const getBetterAuthEnv = createEnvGetter(
  nodeEnvSchema
    .extend({
      APP_URL: z.url("APP_URL must be a valid absolute URL"),
      AUTH_SECRET: z.string().min(32).optional(),
      BETTER_AUTH_SECRET: z.string().min(32).optional(),
      MCP_RESOURCE_URL: z.url("MCP_RESOURCE_URL must be a valid absolute URL").optional(),
      // Existing deployments reuse SESSION_SECRET; no new secret needed.
      SESSION_SECRET: z.string().min(32).optional(),
    })
    // Never fall back to Better Auth's built-in default secret.
    .refine((env) => env.BETTER_AUTH_SECRET || env.AUTH_SECRET || env.SESSION_SECRET, {
      message: "Set BETTER_AUTH_SECRET, AUTH_SECRET or SESSION_SECRET (32+ characters)",
    }),
);

export const getEmailEnv = createEnvGetter(
  z.object({
    RESEND_API_KEY: z.string().min(1, "RESEND_API_KEY is required"),
    RESEND_FROM_EMAIL: z.string().min(1).optional(),
  }),
);

export const getAppEnv = createEnvGetter(
  z.object({
    APP_URL: z.url("APP_URL must be a valid absolute URL"),
  }),
);

export const getStripeEnv = createEnvGetter(
  z.object({
    STRIPE_SECRET_KEY: z.string().min(1, "STRIPE_SECRET_KEY is required"),
  }),
);

export const getStripeWebhookEnv = createEnvGetter(
  z.object({
    STRIPE_WEBHOOK_SECRET: z.string().min(1, "STRIPE_WEBHOOK_SECRET is required"),
  }),
);

export const getCronEnv = createEnvGetter(
  z.object({
    CRON_SECRET: z.string().min(1, "CRON_SECRET is required"),
  }),
);

export const getAiEnv = createEnvGetter(
  z.object({
    ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
    NOTA_CHAT_MODEL: z.string().min(1).default("claude-sonnet-5-5"),
  }),
);

// Hosted installs must opt into single-account payments explicitly.
export const getStripeMode = createEnvGetter(
  z.object({ STRIPE_MODE: z.enum(["connect", "direct"]).default("connect") }),
);

export const getStripeConnectEnv = createEnvGetter(
  z.object({ STRIPE_CONNECT_CLIENT_ID: z.string().min(1) }),
);

export const getStripeConnectWebhookEnv = createEnvGetter(
  z.object({ STRIPE_CONNECT_WEBHOOK_SECRET: z.string().min(1) }),
);

export const getStripeBillingEnv = createEnvGetter(
  z.object({
    STRIPE_PRICE_MONTHLY: z.string().startsWith("price_"),
    STRIPE_PRICE_YEARLY: z.string().startsWith("price_"),
  }),
);
