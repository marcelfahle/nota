import { expect, test } from "bun:test";

import { stripeAmount } from "./stripe-amount";

test("payment amounts use Stripe's currency precision", () => {
  expect(stripeAmount("12.50", "eur")).toBe(1250);
  expect(stripeAmount("9", "usd")).toBe(900);
  expect(stripeAmount("1200", "jpy")).toBe(1200);
  expect(stripeAmount("100", "isk")).toBe(10_000);
});
