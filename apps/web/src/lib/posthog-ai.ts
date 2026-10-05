import { withTracing } from "@posthog/ai/vercel";
import { PostHog } from "posthog-node";

export type AiObservabilityContext = {
  distinctId?: string;
  sessionId: string;
  traceId: string;
};

function getPostHogClient() {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (!key || !host) {
    return null;
  }

  return new PostHog(key, {
    flushAt: 1,
    flushInterval: 0,
    host,
    privacyMode: true,
  });
}

/** Wraps a Vercel AI SDK v6 model and keeps all model calls in one AI trace. */
export function withAiObservability<T extends Parameters<typeof withTracing>[0]>(
  model: T,
  context: AiObservabilityContext,
) {
  const posthog = getPostHogClient();
  return {
    flush: async () => {
      // Telemetry delivery must not turn a successful model call into a failure.
      await posthog?.shutdown().catch(() => {});
    },
    model: posthog
      ? withTracing(model, posthog, {
          posthogDistinctId: context.distinctId,
          posthogPrivacyMode: true,
          posthogProperties: { $ai_session_id: context.sessionId },
          posthogTraceId: context.traceId,
        })
      : model,
  };
}
