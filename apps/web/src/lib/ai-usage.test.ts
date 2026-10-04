import { describe, expect, test } from "bun:test";

import { estimatedCost, isAllowedModel } from "./ai-usage";

describe("AI usage pricing", () => {
  test("estimates asymmetric input and output token prices", () => {
    expect(
      estimatedCost({
        feature: "chat",
        inputTokens: 2_000_000,
        modelId: "claude-sonnet-5-5",
        outputTokens: 500_000,
      }),
    ).toBe(9);
  });

  test("prices Parallel by what it bills: URLs extracted and searches run", () => {
    const parallel = { modelId: "parallel/extract", outputTokens: 0 };
    expect(estimatedCost({ ...parallel, feature: "parallel-extract", inputTokens: 4 })).toBe(0.004);
    expect(estimatedCost({ ...parallel, feature: "parallel-search", inputTokens: 3 })).toBe(0.015);
  });

  test("rejects models outside the operator allowlist", () => {
    expect(isAllowedModel("claude-sonnet-5-5")).toBe(true);
    expect(isAllowedModel("unpriced-model")).toBe(false);
    expect(isAllowedModel("constructor")).toBe(false);
    expect(isAllowedModel("toString")).toBe(false);
  });
});
