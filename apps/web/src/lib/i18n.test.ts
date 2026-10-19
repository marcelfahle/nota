import { describe, expect, test } from "bun:test";

import {
  countryName,
  defaultDocumentLocale,
  documentLocaleOf,
  getTranslator,
  localeFromAcceptLanguage,
  messagesFor,
} from "@/lib/i18n";

import de from "../../messages/de.json";
import en from "../../messages/en.json";

function keysOf(tree: unknown, prefix = ""): Array<string> {
  if (!tree || typeof tree !== "object") {
    return [prefix];
  }
  return Object.entries(tree).flatMap(([key, value]) =>
    keysOf(value, prefix ? `${prefix}.${key}` : key),
  );
}

describe("messages", () => {
  test("German and English carry the same keys", () => {
    expect(keysOf(de).sort()).toEqual(keysOf(en).sort());
  });

  test("every message is a non-empty string", () => {
    for (const tree of [en, de]) {
      for (const key of keysOf(tree)) {
        const value = key.split(".").reduce<unknown>((node, part) => {
          return node && typeof node === "object" ? (node as Record<string, unknown>)[part] : null;
        }, tree);
        expect(typeof value, key).toBe("string");
        expect((value as string).trim().length, key).toBeGreaterThan(0);
      }
    }
  });

  test("a missing German message falls back to English", () => {
    const messages = messagesFor("de") as unknown as Record<string, Record<string, string>>;
    expect(messages.pdf.invoice).toBe("Rechnung");
    expect(Object.keys(messages).sort()).toEqual(Object.keys(en).sort());
  });

  test("translators format values in the document language", () => {
    expect(getTranslator("de", "pdf")("referenceValue", { number: "RE-0007" })).toBe(
      "Rechnung Nr. RE-0007",
    );
    expect(getTranslator("en", "pdf")("referenceValue", { number: "RE-0007" })).toBe(
      "Invoice RE-0007",
    );
  });
});

describe("localeFromAcceptLanguage", () => {
  test("picks the first supported language", () => {
    expect(localeFromAcceptLanguage("de-DE,de;q=0.9,en;q=0.8")).toBe("de");
    expect(localeFromAcceptLanguage("fr-FR,fr;q=0.9,en-US;q=0.8")).toBe("en");
    expect(localeFromAcceptLanguage("fr-CH, de-CH;q=0.8")).toBe("de");
    expect(localeFromAcceptLanguage(null)).toBe("en");
    expect(localeFromAcceptLanguage("")).toBe("en");
  });
});

describe("document language", () => {
  test("German and Austrian workspaces start with German documents", () => {
    expect(defaultDocumentLocale({ countryCode: "DE" })).toBe("de");
    expect(defaultDocumentLocale({ countryCode: "AT" })).toBe("de");
    expect(defaultDocumentLocale({ country: "Deutschland" })).toBe("de");
    expect(defaultDocumentLocale({ country: "Deutschland", countryCode: "ES" })).toBe("en");
    expect(defaultDocumentLocale({ country: "Spain" })).toBe("en");
  });

  test("an issued invoice keeps its snapshot, a draft follows the workspace", () => {
    expect(documentLocaleOf({ documentLocale: "en" }, { documentLocale: "de" })).toBe("en");
    expect(documentLocaleOf({ documentLocale: null }, { documentLocale: "de" })).toBe("de");
    expect(documentLocaleOf({ documentLocale: "nonsense" }, { documentLocale: "en" })).toBe("en");
  });
});

describe("countryName", () => {
  test("names a region in the document language and keeps unknown input", () => {
    expect(countryName("DE", "de")).toBe("Deutschland");
    expect(countryName("DE", "en")).toBe("Germany");
    expect(countryName("fr", "de")).toBe("Frankreich");
    expect(countryName("Germany", "de")).toBe("Germany");
    expect(countryName(null, "de")).toBeNull();
  });
});
