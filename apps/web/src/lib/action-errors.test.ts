import { describe, expect, test } from "bun:test";

import { ACTION_ERRORS, actionErrorKey } from "@/lib/action-errors";
import { getTranslator } from "@/lib/i18n";

import en from "../../messages/en.json";

describe("action errors", () => {
  test("English messages are the sentences the services speak", () => {
    expect(en.errors).toEqual(ACTION_ERRORS);
  });

  test("a known sentence maps to its key and a German translation", () => {
    const key = actionErrorKey("Cannot remove the last owner");
    expect(key).toBe("lastOwnerRemove");
    expect(getTranslator("de", "errors")(key!)).toBe(
      "Der letzte Inhaber kann nicht entfernt werden",
    );
  });

  test("an unknown sentence has no key, so it passes through as it came", () => {
    expect(actionErrorKey("Something new went wrong")).toBeNull();
  });
});
