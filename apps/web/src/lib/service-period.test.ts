import { describe, expect, test } from "bun:test";

import { defaultServicePeriod } from "@/lib/service-period";

describe("defaultServicePeriod", () => {
  test("uses the month all line items name", () => {
    expect(
      defaultServicePeriod(
        [{ description: "Design September 2026" }, { description: "Dev – 2026-09" }],
        "2026-10-05",
      ),
    ).toEqual({ end: "2026-09-30", start: "2026-09-01" });
  });

  test("rolls a later month into the previous year", () => {
    expect(defaultServicePeriod([{ description: "Support December" }], "2026-01-10")).toEqual({
      end: "2025-12-31",
      start: "2025-12-01",
    });
  });

  test("falls back to the issue date when items disagree or say nothing", () => {
    expect(
      defaultServicePeriod(
        [{ description: "Design September" }, { description: "Dev October" }],
        "2026-10-05",
      ),
    ).toEqual({ end: "2026-10-05", start: "2026-10-05" });
    expect(defaultServicePeriod([{ description: "Consulting" }], "2026-10-05")).toEqual({
      end: "2026-10-05",
      start: "2026-10-05",
    });
    expect(defaultServicePeriod([], "not-a-date")).toBeNull();
  });
});
