import { SeverityNumber } from "@opentelemetry/api-logs";

import { posthogLoggerProvider } from "@/instrumentation";

const logger = posthogLoggerProvider?.getLogger("nota-posthog-exporter");

export function logChatGenerationStarted(messageCount: number) {
  logger?.emit({
    attributes: { message_count: messageCount, route: "/api/chat" },
    body: "Chat generation started",
    severityNumber: SeverityNumber.INFO,
    severityText: "INFO",
  });
}

export function logChatGenerationCompleted() {
  logger?.emit({
    attributes: { route: "/api/chat" },
    body: "Chat generation completed",
    severityNumber: SeverityNumber.INFO,
    severityText: "INFO",
  });
}

export async function flushPostHogLogs() {
  await posthogLoggerProvider?.forceFlush().catch(() => {});
}
