import { describe, expect, test } from "bun:test";

import { estimatedCost, isAllowedModel } from "./ai-usage";

describe("AI usage pricing", () => {
  test("estimates asymmetric input and output token prices", () => {
    expect(
      estimatedCost({
        feature: "chat",
        inputTokens: 2_000_000,
        modelId: "claude-haiku-4-5-20251001",
        outputTokens: 500_000,
      }),
    ).toBe(4.5);
  });

  test("prices each successful Parallel request", () => {
    expect(
      estimatedCost({
        feature: "parallel-search",
        inputTokens: 0,
        modelId: "parallel/search",
        outputTokens: 0,
        requests: 3,
      }),
    ).toBe(0.003);
  });

  test("rejects models outside the operator allowlist", () => {
    expect(isAllowedModel("claude-sonnet-5-5")).toBe(true);
    expect(isAllowedModel("unpriced-model")).toBe(false);
    expect(isAllowedModel("constructor")).toBe(false);
    expect(isAllowedModel("toString")).toBe(false);
  });
});
