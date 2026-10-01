export * from "@nota-app/sdk";

import { NotaClient } from "@nota-app/sdk";

// Bound remote API calls so a stalled Nota deployment cannot hold OAuth or MCP requests open.
export function createRemoteNotaClient(url: string, apiKey: string) {
  return new NotaClient(url, apiKey, (input, init) =>
    fetch(input, {
      ...init,
      signal: init?.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(30_000)])
        : AbortSignal.timeout(30_000),
    }),
  );
}
