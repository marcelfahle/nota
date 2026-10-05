import { expect, test } from "bun:test";

test("chat logs export both lifecycle messages with the service and INFO severity", async () => {
  const payloads: Array<{
    resourceLogs: Array<{
      resource: { attributes: Array<{ key: string; value: { stringValue: string } }> };
      scopeLogs: Array<{
        logRecords: Array<{
          body: { stringValue: string };
          severityNumber: number;
          severityText: string;
        }>;
      }>;
    }>;
  }> = [];
  const server = Bun.serve({
    async fetch(request) {
      expect(new URL(request.url).pathname).toBe("/i/v1/logs");
      expect(request.headers.get("authorization")).toBe("Bearer phc_test");
      payloads.push(await request.json());
      return Response.json({});
    },
    port: 0,
  });
  try {
    // A fresh process runs the real provider with its own configuration, avoiding
    // module-cache interference with route tests and any live developer keys.
    const child = Bun.spawn(
      [
        "bun",
        "--eval",
        `import { flushPostHogLogs, logChatGenerationStarted, logChatGenerationCompleted } from ${JSON.stringify(new URL("./posthog-logs.ts", import.meta.url).pathname)};
       logChatGenerationStarted(2);
       logChatGenerationCompleted();
       await flushPostHogLogs();`,
      ],
      {
        env: {
          ...process.env,
          NEXT_PUBLIC_POSTHOG_HOST: server.url.toString(),
          NEXT_PUBLIC_POSTHOG_KEY: "phc_test",
        },
        stderr: "pipe",
        stdout: "pipe",
      },
    );
    expect(await child.exited).toBe(0);
    const resources = payloads.flatMap((payload) => payload.resourceLogs);
    expect(resources[0]?.resource.attributes).toContainEqual({
      key: "service.name",
      value: { stringValue: "nota-web" },
    });
    const records = resources
      .flatMap((resource) => resource.scopeLogs)
      .flatMap((scope) => scope.logRecords);
    expect(records.map((record) => record.body.stringValue)).toEqual([
      "Chat generation started",
      "Chat generation completed",
    ]);
    expect(
      records.every((record) => record.severityNumber === 9 && record.severityText === "INFO"),
    ).toBe(true);
  } finally {
    await server.stop(true);
  }
});
