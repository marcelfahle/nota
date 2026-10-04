// Parallel (parallel.ai) fetches and searches on our behalf, so page text for
// the model never passes through our own network.

const API = "https://api.parallel.ai/v1";

export type ParallelPage = { text: string; title: string | null; url: string };

export function parallelConfigured() {
  return Boolean(process.env.PARALLEL_API_KEY);
}

async function call<T>(path: string, body: unknown, timeoutMs: number, signal?: AbortSignal) {
  const key = process.env.PARALLEL_API_KEY;
  if (!key) {
    return null;
  }
  try {
    const response = await fetch(`${API}${path}`, {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json", "x-api-key": key },
      method: "POST",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
        : AbortSignal.timeout(timeoutMs),
    });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

type RawResult = {
  excerpts?: Array<string>;
  full_content?: string | null;
  title?: string | null;
  url: string;
};

/** Markdown for each URL that could be read; unreadable ones are left out. */
export async function extractPages(
  urls: Array<string>,
  options: { maxCharsPerPage?: number; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<Array<ParallelPage>> {
  if (urls.length === 0) {
    return [];
  }
  const payload = await call<{ results?: Array<RawResult> }>(
    "/extract",
    {
      advanced_settings: {
        full_content: { max_chars_per_result: options.maxCharsPerPage ?? 9000 },
      },
      objective:
        "The company's name, legal entity, registered address, VAT ID, contact email, and what the company does.",
      urls,
    },
    options.timeoutMs ?? 12_000,
    options.signal,
  );
  return (payload?.results ?? [])
    .map((result) => ({
      text: (result.full_content ?? result.excerpts?.join("\n\n") ?? "").trim(),
      title: result.title ?? null,
      url: result.url,
    }))
    .filter((page) => page.text.length > 0);
}

export async function searchWeb(
  objective: string,
  query: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<Array<ParallelPage>> {
  const payload = await call<{ results?: Array<RawResult> }>(
    "/search",
    {
      advanced_settings: { excerpt_settings: { max_chars_per_result: 1600 }, max_results: 8 },
      mode: "fast",
      objective,
      search_queries: [query],
    },
    options.timeoutMs ?? 6000,
    options.signal,
  );
  return (payload?.results ?? [])
    .map((result) => ({
      text: (result.excerpts ?? []).join("\n").trim(),
      title: result.title ?? null,
      url: result.url,
    }))
    .filter((page) => page.text.length > 0);
}
