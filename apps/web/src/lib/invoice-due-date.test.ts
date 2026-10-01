import { expect, test } from "bun:test";

import { resolveDueDateChange } from "@/lib/invoice-due-date";

test("updates an overdue invoice and respects roles and terminal statuses", () => {
  const input = {
    dueAt: "2026-10-08",
    issuedAt: "2026-08-31",
    role: "owner" as const,
    status: "overdue",
    today: "2026-09-30",
  };
  expect(resolveDueDateChange(input)).toEqual({ dueAt: "2026-10-08", status: "sent" });
  expect(resolveDueDateChange({ ...input, role: "member", status: "draft" })).toEqual({
    dueAt: "2026-10-08",
    status: "draft",
  });
  expect(() => resolveDueDateChange({ ...input, role: "member" })).toThrow(
    "Insufficient permissions",
  );
  for (const status of ["paid", "cancelled", null, "unknown"]) {
    expect(() => resolveDueDateChange({ ...input, status })).toThrow("Only draft");
  }
  expect(() => resolveDueDateChange({ ...input, dueAt: "2026-02-30" })).toThrow("valid date");
  expect(() => resolveDueDateChange({ ...input, dueAt: "2026-01-01" })).toThrow(
    "before the issue date",
  );
});
