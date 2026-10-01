import { expect, test } from "bun:test";

import Stripe from "stripe";

test("payment helpers load without an API key and require it only when used", () => {
  // Isolate the environment/cache from other tests and local .env files.
  const result = Bun.spawnSync({
    cmd: [
      process.execPath,
      "--no-env-file",
      "-e",
      `
      delete process.env.STRIPE_SECRET_KEY;
      const { createPaymentLink } = await import("./src/lib/stripe.ts");
      try {
        await createPaymentLink({ id: "fixture", number: "97", currency: "EUR", total: "1000" });
        throw new Error("Payment operation unexpectedly accepted missing credentials");
      } catch (error) {
        if (!error.issues?.some(issue => issue.path.includes("STRIPE_SECRET_KEY"))) throw error;
      }
    `,
    ],
    cwd: process.cwd(),
    stderr: "pipe",
    stdout: "pipe",
  });
  expect(result.exitCode).toBe(0);
});

test("webhook signatures can be verified offline and reject altered payment data", async () => {
  const payload = JSON.stringify({
    data: { object: {} },
    id: "evt_fixture",
    type: "checkout.session.completed",
  });
  const secret = "whsec_fixture";
  const signature = await Stripe.webhooks.generateTestHeaderStringAsync({ payload, secret });
  expect((await Stripe.webhooks.constructEventAsync(payload, signature, secret)).id).toBe(
    "evt_fixture",
  );
  await expect(
    Stripe.webhooks.constructEventAsync(
      payload.replace("evt_fixture", "evt_tampered"),
      signature,
      secret,
    ),
  ).rejects.toThrow();
});
