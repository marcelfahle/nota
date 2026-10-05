import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor, LoggerProvider } from "@opentelemetry/sdk-logs";

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;

function createLoggerProvider() {
  if (!posthogKey || !posthogHost) {
    return null;
  }

  return new LoggerProvider({
    processors: [
      new BatchLogRecordProcessor({
        exporter: new OTLPLogExporter({
          headers: {
            Authorization: `Bearer ${posthogKey}`,
            "Content-Type": "application/json",
          },
          url: new URL("/i/v1/logs", posthogHost).toString(),
        }),
      }),
    ],
    resource: resourceFromAttributes({ "service.name": "nota-web" }),
  });
}

// This provider is deliberately not registered globally: only the dedicated logger
// in src/lib/posthog-logs.ts may export lines added by this integration.
export const posthogLoggerProvider = createLoggerProvider();

export function register() {
  // Next.js loads this module for server instrumentation. Route handlers import the
  // dedicated logger directly so existing application loggers remain untouched.
}
