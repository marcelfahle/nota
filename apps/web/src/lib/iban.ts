/**
 * IBAN validation and formatting utilities (ISO 13616).
 */

/** Normalize an IBAN: uppercase, strip all whitespace. */
export function formatIban(iban: string): string {
  return iban.replaceAll(/\s/g, "").toUpperCase();
}

/** Validate an IBAN using the MOD-97 algorithm. */
export function validateIban(iban: string): { error?: string; valid: boolean } {
  const normalized = formatIban(iban);

  if (normalized.length === 0) {
    return { error: "IBAN is required", valid: false };
  }

  if (!/^[A-Z]{2}/.test(normalized)) {
    return { error: "IBAN must start with a two-letter country code", valid: false };
  }

  if (!/^[A-Z]{2}\d{2}/.test(normalized)) {
    return { error: "Country code must be followed by two check digits", valid: false };
  }

  if (normalized.length < 15) {
    return { error: "IBAN is too short", valid: false };
  }

  if (normalized.length > 34) {
    return { error: "IBAN is too long", valid: false };
  }

  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(normalized)) {
    return { error: "IBAN contains invalid characters", valid: false };
  }

  // MOD-97 check: move first 4 chars to end, convert letters to numbers, check mod 97 === 1
  const rearranged = normalized.slice(4) + normalized.slice(0, 4);
  const numeric = rearranged.replaceAll(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));

  // Process in chunks to avoid BigInt for wide browser compat
  let remainder = 0;
  for (let i = 0; i < numeric.length; i += 7) {
    const chunk = String(remainder) + numeric.slice(i, i + 7);
    remainder = Number(chunk) % 97;
  }

  if (remainder !== 1) {
    return { error: "Invalid IBAN check digits", valid: false };
  }

  return { valid: true };
}

/** Format an IBAN for display in groups of 4 (e.g. `DE89 3704 0044 0532 0130 00`). */
export function formatIbanDisplay(iban: string): string {
  const normalized = formatIban(iban);
  return normalized.replaceAll(/(.{4})(?=.)/g, "$1 ");
}
