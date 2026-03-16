import { describe, expect, test } from "bun:test";

import { formatIban, formatIbanDisplay, validateIban } from "@/lib/iban";

describe("formatIban", () => {
  test("uppercases and strips spaces", () => {
    expect(formatIban("de89 3704 0044 0532 0130 00")).toBe("DE89370400440532013000");
  });

  test("handles already clean input", () => {
    expect(formatIban("DE89370400440532013000")).toBe("DE89370400440532013000");
  });
});

describe("validateIban", () => {
  const validIbans = [
    { country: "DE", iban: "DE89370400440532013000" },
    { country: "ES", iban: "ES9121000418450200051332" },
    { country: "PT", iban: "PT50000201231234567890154" },
    { country: "GB", iban: "GB29NWBK60161331926819" },
    { country: "FR", iban: "FR7630006000011234567890189" },
    { country: "NL", iban: "NL91ABNA0417164300" },
  ];

  for (const { country, iban } of validIbans) {
    test(`accepts valid ${country} IBAN`, () => {
      expect(validateIban(iban)).toEqual({ valid: true });
    });
  }

  test("accepts IBAN with spaces", () => {
    expect(validateIban("DE89 3704 0044 0532 0130 00")).toEqual({ valid: true });
  });

  test("accepts lowercase input", () => {
    expect(validateIban("de89370400440532013000")).toEqual({ valid: true });
  });

  test("rejects empty string", () => {
    const result = validateIban("");
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  test("rejects wrong check digit", () => {
    const result = validateIban("DE00370400440532013000");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Invalid IBAN check digits");
  });

  test("rejects too short", () => {
    const result = validateIban("DE8937040044");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("IBAN is too short");
  });

  test("rejects too long", () => {
    const result = validateIban("DE89370400440532013000123456789012345");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("IBAN is too long");
  });

  test("rejects bad country code", () => {
    const result = validateIban("1234567890123456");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("IBAN must start with a two-letter country code");
  });

  test("rejects missing check digits", () => {
    const result = validateIban("DEXX370400440532013000");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Country code must be followed by two check digits");
  });
});

describe("formatIbanDisplay", () => {
  test("groups into blocks of 4", () => {
    expect(formatIbanDisplay("DE89370400440532013000")).toBe("DE89 3704 0044 0532 0130 00");
  });

  test("handles already spaced input", () => {
    expect(formatIbanDisplay("DE89 3704 0044 0532 0130 00")).toBe("DE89 3704 0044 0532 0130 00");
  });

  test("handles short IBAN", () => {
    expect(formatIbanDisplay("NL91ABNA0417164300")).toBe("NL91 ABNA 0417 1643 00");
  });
});
