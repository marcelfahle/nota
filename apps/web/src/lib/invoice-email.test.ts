import { expect, test } from "bun:test";

import { invoiceEmailEnvelope } from "@/lib/invoice-email";

const from = { address: "hello@withnota.com", name: "Nota" };

test("a send is named after the sender, copies the CC list and takes replies back", () => {
  expect(
    invoiceEmailEnvelope({
      clientEmail: "invoice@ranger.de",
      from,
      personal: {
        cc: ["volker@ranger.de"],
        replyTo: "marcel@example.com",
        senderName: "Marcel Fahle",
      },
    }),
  ).toEqual({
    cc: ["volker@ranger.de"],
    from: '"Marcel Fahle via Nota" <hello@withnota.com>',
    replyTo: "marcel@example.com",
    to: ["invoice@ranger.de"],
  });
});

test("a test copy goes to the sender alone, and an unnamed send keeps the app's From", () => {
  expect(
    invoiceEmailEnvelope({
      clientEmail: "invoice@ranger.de",
      from,
      personal: { cc: ["volker@ranger.de"], replyTo: "marcel@example.com" },
      recipient: "marcel@example.com",
    }),
  ).toEqual({
    cc: undefined,
    from: undefined,
    replyTo: "marcel@example.com",
    to: ["marcel@example.com"],
  });
  expect(
    invoiceEmailEnvelope({
      clientEmail: "a@b.c",
      from: { address: null, name: "Nota" },
      personal: { senderName: "M" },
    }),
  ).toEqual({ cc: undefined, from: undefined, replyTo: undefined, to: ["a@b.c"] });
});
