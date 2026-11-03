import { expect, test } from "bun:test";

import {
  normalizeSendOptions,
  parseCcInput,
  resolveSendOptions,
  SEND_MESSAGE_MAX_LENGTH,
} from "@/lib/send-options";

test("a CC field accepts commas, semicolons and whitespace between addresses", () => {
  expect(parseCcInput(" a@example.com, b@example.com;c@example.com\nd@example.com ")).toEqual([
    "a@example.com",
    "b@example.com",
    "c@example.com",
    "d@example.com",
  ]);
  expect(parseCcInput("")).toEqual([]);
});

test("options are trimmed, deduplicated and bounded", () => {
  expect(
    normalizeSendOptions({
      cc: [" a@example.com ", "a@example.com", ""],
      message: "  Hallo zusammen,\n\nanbei die Rechnung.  ",
    }),
  ).toEqual({ cc: ["a@example.com"], message: "Hallo zusammen,\n\nanbei die Rechnung." });
  expect(normalizeSendOptions({ message: "   " })).toEqual({ cc: [], message: null });
  expect(normalizeSendOptions({ message: "x".repeat(SEND_MESSAGE_MAX_LENGTH + 1) })).toEqual({
    error: `The message can be at most ${SEND_MESSAGE_MAX_LENGTH} characters long.`,
  });
  expect(
    normalizeSendOptions({ cc: Array.from({ length: 6 }, (_, i) => `p${i}@example.com`) }),
  ).toEqual({ error: "At most 5 CC addresses can be added." });
  expect(normalizeSendOptions({ cc: ["not-an-address"] })).toEqual({
    error: '"not-an-address" is not a valid email address.',
  });
});

test("a send without options keeps what the client was last sent with", () => {
  const client = { sendCc: ["cc@example.com"], sendMessage: "Thanks as always!" };
  expect(resolveSendOptions(undefined, client)).toEqual({
    cc: ["cc@example.com"],
    message: "Thanks as always!",
  });
  expect(resolveSendOptions(undefined, { sendCc: null, sendMessage: null })).toEqual({
    cc: [],
    message: null,
  });
  // Explicitly empty options clear the defaults rather than falling back to them.
  expect(resolveSendOptions({ cc: [], message: null }, client)).toEqual({ cc: [], message: null });
});
