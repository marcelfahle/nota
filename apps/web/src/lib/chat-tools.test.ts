import { describe, expect, test } from "bun:test";

import { buildChatSystemPrompt, type ChatToolContext } from "@/lib/chat-tools";

function context(locale: "de" | "en"): ChatToolContext {
  return {
    org: { businessName: "Beispiel GmbH", defaultCurrency: "EUR", name: "Beispiel" },
    role: "owner",
    user: { id: "user-1", locale },
  } as unknown as ChatToolContext;
}

const emptyContext = { clients: [], recentInvoices: [] };

describe("buildChatSystemPrompt", () => {
  test("tells Nota to answer in the user's language and keep data verbatim", () => {
    const prompt = buildChatSystemPrompt(context("en"), emptyContext);
    expect(prompt).toContain("Answer in the language the user writes in.");
    expect(prompt).toContain("answer in English.");
    expect(prompt).toContain(
      "Keep invoice numbers, amounts, dates and tool results exactly as given",
    );
  });

  test("defaults to the member's UI language", () => {
    expect(buildChatSystemPrompt(context("de"), emptyContext)).toContain("answer in German.");
    expect(buildChatSystemPrompt(context("en"), emptyContext)).toContain("answer in English.");
  });
});
