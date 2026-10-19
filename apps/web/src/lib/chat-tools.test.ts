import { describe, expect, test } from "bun:test";

import { buildChatSystemPrompt, type ChatToolContext } from "@/lib/chat-tools";

function context(country: string | null): ChatToolContext {
  return {
    org: { businessName: "Beispiel GmbH", country, defaultCurrency: "EUR", name: "Beispiel" },
    role: "owner",
    user: { id: "user-1" },
  } as unknown as ChatToolContext;
}

const emptyContext = { clients: [], recentInvoices: [] };

describe("buildChatSystemPrompt", () => {
  test("tells Nota to answer in the user's language and keep data verbatim", () => {
    const prompt = buildChatSystemPrompt(context("Spain"), emptyContext);
    expect(prompt).toContain("Answer in the language the user writes in.");
    expect(prompt).toContain("answer in English.");
    expect(prompt).toContain(
      "Keep invoice numbers, amounts, dates and tool results exactly as given",
    );
  });

  test("defaults to German for a German workspace", () => {
    expect(buildChatSystemPrompt(context("Germany"), emptyContext)).toContain("answer in German.");
    expect(buildChatSystemPrompt(context("Deutschland"), emptyContext)).toContain(
      "answer in German.",
    );
    expect(buildChatSystemPrompt(context(null), emptyContext)).toContain("answer in English.");
  });
});
