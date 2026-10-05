import { z } from "zod";

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);
const optionalUrl = z.preprocess((value) => (value === "" ? undefined : value), z.url().optional());

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
  z
    .object({
      EMAIL_FROM: z.string().min(1).default("Nota <nota@localhost>"),
      EMAIL_LOG_PATH: z.string().min(1).default("/data/mail/sends.jsonl"),
      EMAIL_PROVIDER: z.enum(["helo", "smtp", "log"]).default("helo"),
      HELO_API_KEY: optionalString,
      HELO_CHANNEL_ID: z.preprocess(
        (value) => (value === "" ? undefined : value),
        z.string().uuid().optional(),
      ),
      SMTP_URL: optionalString,
    })
    .superRefine((env, context) => {
      if (env.EMAIL_PROVIDER === "helo" && !env.HELO_API_KEY) {
        context.addIssue({ code: "custom", message: "HELO_API_KEY is required for Helo email" });
      }
      if (env.EMAIL_PROVIDER === "smtp" && !env.SMTP_URL) {
        context.addIssue({ code: "custom", message: "SMTP_URL is required for SMTP email" });
      }
    }),
);

export const getAppEnv = createEnvGetter(
  z.object({
    APP_URL: z.url("APP_URL must be a valid absolute URL"),
  }),
);

export const getStorageEnv = createEnvGetter(
  z
    .object({
      BLOB_READ_WRITE_TOKEN: optionalString,
      LOCAL_STORAGE_PATH: z.string().min(1).default("/data/storage"),
      S3_ACCESS_KEY_ID: optionalString,
      S3_BUCKET: optionalString,
      S3_ENDPOINT: optionalUrl,
      S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("false"),
      S3_PUBLIC_URL: optionalUrl,
      S3_REGION: z.string().min(1).default("us-east-1"),
      S3_SECRET_ACCESS_KEY: optionalString,
      STORAGE: z.enum(["vercel-blob", "s3", "local"]).default("vercel-blob"),
    })
    .superRefine((env, context) => {
      if (env.STORAGE === "vercel-blob" && !env.BLOB_READ_WRITE_TOKEN) {
        context.addIssue({ code: "custom", message: "BLOB_READ_WRITE_TOKEN is required" });
      }
      if (env.STORAGE === "s3" && (!env.S3_BUCKET || !env.S3_PUBLIC_URL)) {
        context.addIssue({ code: "custom", message: "S3_BUCKET and S3_PUBLIC_URL are required" });
      }
      if (Boolean(env.S3_ACCESS_KEY_ID) !== Boolean(env.S3_SECRET_ACCESS_KEY)) {
        context.addIssue({
          code: "custom",
          message: "S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be set together",
        });
      }
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

export const getDeploymentEnv = createEnvGetter(
  z.object({
    DEPLOYMENT_MODE: z.enum(["hosted", "self-hosted"]).default("hosted"),
    PAYMENT_MODE: z.enum(["stripe", "bank-transfer"]).default("stripe"),
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
