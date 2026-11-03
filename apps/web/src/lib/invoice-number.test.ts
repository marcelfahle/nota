import { expect, test } from "bun:test";

import { draftIdentifier, invoiceNumberLabel, isDraftNumber } from "@/lib/invoice-number";

test("a draft identifier is never printed as a number", () => {
  const draft = draftIdentifier("3058b69c-c25b-4436-8a87-52417ee13b64");
  expect(isDraftNumber(draft)).toBe(true);
  expect(isDraftNumber("0000104")).toBe(false);
  expect(isDraftNumber(null)).toBe(false);
  expect(invoiceNumberLabel(draft, "Draft")).toBe("Draft");
  expect(invoiceNumberLabel("0000104", "Draft")).toBe("0000104");
  expect(invoiceNumberLabel(null, "Draft")).toBe("Draft");
});
