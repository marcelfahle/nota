import { expect, test } from "bun:test";

import { generateText } from "ai";
import { MockLanguageModelV3 } from "ai/test";

import { withAiObservability } from "./posthog-ai";

test("AI telemetry preserves usage and trace IDs without sending prompts or completions", async () => {
  const requests: Array<{ batch?: Array<{ event: string; properties: Record<string, unknown> }> }> =
    [];
  const server = Bun.serve({
    async fetch(request) {
      const body = new Uint8Array(await request.arrayBuffer());
      const decoded =
        request.headers.get("content-encoding") === "gzip" ? Bun.gunzipSync(body) : body;
      requests.push(JSON.parse(new TextDecoder().decode(decoded)));
      return Response.json({ status: 1 });
    },
    port: 0,
  });
  const previousKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const previousHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
  process.env.NEXT_PUBLIC_POSTHOG_HOST = server.url.toString();
  try {
    const { flush, model } = withAiObservability(
      new MockLanguageModelV3({
        doGenerate: {
          content: [{ text: "Private invoice completion", type: "text" }],
          finishReason: { raw: "stop", unified: "stop" },
          usage: {
            inputTokens: { cacheRead: 0, cacheWrite: 0, noCache: 12, total: 12 },
            outputTokens: { reasoning: 0, text: 5, total: 5 },
          },
          warnings: [],
        },
      }),
      { distinctId: "test-user", sessionId: "test-session", traceId: "test-trace" },
    );
    const result = await generateText({ model, prompt: "Private customer prompt" });
    await flush();
    expect(result.text).toBe("Private invoice completion");
    const generation = requests
      .flatMap((request) => request.batch ?? [])
      .find((event) => event.event === "$ai_generation");
    expect(generation?.properties).toMatchObject({
      $ai_input_tokens: 12,
      $ai_output_tokens: 5,
      $ai_session_id: "test-session",
      $ai_trace_id: "test-trace",
    });
    expect(JSON.stringify(requests)).not.toContain("Private customer prompt");
    expect(JSON.stringify(requests)).not.toContain("Private invoice completion");
  } finally {
    if (previousKey === undefined) {
      delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    } else {
      process.env.NEXT_PUBLIC_POSTHOG_KEY = previousKey;
    }
    if (previousHost === undefined) {
      delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
    } else {
      process.env.NEXT_PUBLIC_POSTHOG_HOST = previousHost;
    }
    await server.stop(true);
  }
});
