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
