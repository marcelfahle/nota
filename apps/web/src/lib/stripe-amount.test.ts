import { expect, test } from "bun:test";

import { stripeAmount, stripePaymentAmount } from "./stripe-amount";

test("payment amounts use Stripe's currency precision", () => {
  expect(stripeAmount("12.50", "eur")).toBe(1250);
  expect(stripeAmount("9", "usd")).toBe(900);
  expect(stripeAmount("1200", "jpy")).toBe(1200);
  expect(stripeAmount("150.50", "jpy")).toBe(151);
  expect(stripeAmount("1.234", "bhd")).toBe(1234);
  expect(stripeAmount("100", "isk")).toBe(10_000);
  expect(stripePaymentAmount(1234, "bhd")).toBe("1.234");
  expect(stripePaymentAmount(10_000, "isk")).toBe("100.00");
});
