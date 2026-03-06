import { expect, test } from "bun:test";

import { parseLineItem } from "../src/line-items";

test("parseLineItem accepts the supported shorthand formats", () => {
  expect(parseLineItem("Development, 40hrs at 120")).toEqual({
    description: "Development",
    quantity: 40,
    unitPrice: 120,
  });

  expect(parseLineItem("2 x Workshop @ 1500")).toEqual({
    description: "Workshop",
    quantity: 2,
    unitPrice: 1500,
  });

  expect(parseLineItem("Discovery | 1 | 800")).toEqual({
    description: "Discovery",
    quantity: 1,
    unitPrice: 800,
  });
});

test("parseLineItem normalizes common EU number separators", () => {
  expect(parseLineItem("Strategy sprint, 1,5hrs at 1.250,50")).toEqual({
    description: "Strategy sprint",
    quantity: 1.5,
    unitPrice: 1250.5,
  });
});

test("parseLineItem rejects malformed rows", () => {
  expect(() => parseLineItem("bad input")).toThrow(
    "Line items must look like 'Development, 40hrs at 120', '2 x Workshop @ 1500', or 'Discovery | 1 | 800'.",
  );
});
