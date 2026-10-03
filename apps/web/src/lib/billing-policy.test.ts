import { expect, test } from "bun:test";

import { canSendOnPlan, billingMonth, paymentAccount } from "./billing-policy";

test("five free sends per UTC calendar month; paid and self-hosted sends are unlimited", () => {
  expect(canSendOnPlan("connect", "free", 4)).toBe(true);
  expect(canSendOnPlan("connect", "free", 5)).toBe(false);
  expect(canSendOnPlan("connect", "pro", 500)).toBe(true);
  expect(canSendOnPlan("direct", "free", 500)).toBe(true);
  expect(billingMonth(new Date("2026-10-01T00:00:00Z"))).toBe("2026-10-01");
  expect(billingMonth(new Date("2026-09-30T23:59:59Z"))).toBe("2026-09-01");
});

test("hosted payments never fall back to the platform account", () => {
  expect(paymentAccount("connect", null, false)).toBe(null);
  expect(paymentAccount("connect", "acct_a", false)).toBe(null);
  expect(paymentAccount("connect", "acct_a", true)).toBe("acct_a");
  expect(paymentAccount("connect", "acct_b", true)).toBe("acct_b");
  expect(paymentAccount("direct", null, false)).toBe("platform");
});
