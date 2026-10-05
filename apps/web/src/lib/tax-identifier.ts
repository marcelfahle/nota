export const TAX_IDENTIFIER_TYPES = ["eu_vat", "us_ein", "tax_id"] as const;

export type TaxIdentifierType = (typeof TAX_IDENTIFIER_TYPES)[number];

export type TaxIdentifier = {
  canonicalValue: string;
  countryCode: string | null;
  type: TaxIdentifierType;
  value: string;
};

export type TaxIdentifierInput = {
  countryCode?: string | null;
  type: TaxIdentifierType;
  value: string;
};

export type TaxIdentifierColumns = {
  taxIdentifierCanonicalValue?: string | null;
  taxIdentifierCountryCode?: string | null;
  taxIdentifierType?: string | null;
  taxIdentifierValue?: string | null;
  vatNumber?: string | null;
};

const VIES_COUNTRIES = new Set(
  "AT BE BG CY CZ DE DK EE EL ES FI FR HR HU IE IT LT LU LV MT NL PL PT RO SE SI SK XI".split(" "),
);

export class TaxIdentifierValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaxIdentifierValidationError";
  }
}

export function isViesCountry(countryCode: string) {
  return VIES_COUNTRIES.has(countryCode.toUpperCase());
}

export function normalizeVatNumber(value: string) {
  return value.replaceAll(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function countryCode(value?: string | null) {
  const normalized = value?.trim().toUpperCase() ?? "";
  if (normalized && !/^[A-Z]{2}$/.test(normalized)) {
    throw new TaxIdentifierValidationError("Country code must be a two-letter ISO code");
  }
  return normalized || null;
}

export function normalizeTaxIdentifier(input: TaxIdentifierInput | null | undefined) {
  if (!input || !input.value.trim()) {
    return null;
  }
  const value = input.value.trim();
  if (value.length > 100) {
    throw new TaxIdentifierValidationError("Tax identifier must be 100 characters or fewer");
  }

  if (input.type === "eu_vat") {
    const canonicalValue = normalizeVatNumber(value);
    const prefix = canonicalValue.slice(0, 2);
    if (canonicalValue.length < 4 || canonicalValue.length > 20 || !isViesCountry(prefix)) {
      throw new TaxIdentifierValidationError("Enter an EU VAT ID with its country prefix");
    }
    return {
      canonicalValue,
      countryCode: prefix,
      type: input.type,
      value: canonicalValue,
    } satisfies TaxIdentifier;
  }

  if (input.type === "us_ein") {
    const canonicalValue = value.replaceAll(/\D/g, "");
    if (canonicalValue.length !== 9) {
      throw new TaxIdentifierValidationError("Enter a nine-digit EIN");
    }
    return {
      canonicalValue,
      countryCode: "US",
      type: input.type,
      value: `${canonicalValue.slice(0, 2)}-${canonicalValue.slice(2)}`,
    } satisfies TaxIdentifier;
  }

  const canonicalValue = value
    .normalize("NFKC")
    .replaceAll(/[^\p{L}\p{N}]/gu, "")
    .toUpperCase();
  if (canonicalValue.length < 2) {
    throw new TaxIdentifierValidationError("Enter a tax identifier");
  }
  return {
    canonicalValue,
    countryCode: countryCode(input.countryCode),
    type: input.type,
    value,
  } satisfies TaxIdentifier;
}

export function taxIdentifierFromLegacyVatNumber(value?: string | null) {
  if (!value?.trim()) {
    return null;
  }
  const canonicalValue = normalizeVatNumber(value);
  return normalizeTaxIdentifier(
    isViesCountry(canonicalValue.slice(0, 2))
      ? { type: "eu_vat", value }
      : { type: "tax_id", value },
  );
}

export function taxIdentifierFromColumns(columns: TaxIdentifierColumns) {
  if (
    TAX_IDENTIFIER_TYPES.includes(columns.taxIdentifierType as TaxIdentifierType) &&
    columns.taxIdentifierValue
  ) {
    return normalizeTaxIdentifier({
      countryCode: columns.taxIdentifierCountryCode,
      type: columns.taxIdentifierType as TaxIdentifierType,
      value: columns.taxIdentifierValue,
    });
  }
  return taxIdentifierFromLegacyVatNumber(columns.vatNumber);
}

export function invoiceTaxIdentifier(
  status: string | null,
  snapshot: TaxIdentifier | null | undefined,
  current: TaxIdentifierColumns,
) {
  return status === "draft" ? taxIdentifierFromColumns(current) : (snapshot ?? null);
}

export function taxIdentifierFields(identifier: TaxIdentifier | null) {
  return {
    taxIdentifierCanonicalValue: identifier?.canonicalValue ?? null,
    taxIdentifierCountryCode: identifier?.countryCode ?? null,
    taxIdentifierType: identifier?.type ?? null,
    taxIdentifierValue: identifier?.value ?? null,
    vatNumber: identifier?.type === "eu_vat" ? identifier.canonicalValue : null,
  };
}

export function taxIdentifierLabel(identifier: Pick<TaxIdentifier, "type">) {
  if (identifier.type === "eu_vat") {
    return "VAT ID";
  }
  if (identifier.type === "us_ein") {
    return "EIN";
  }
  return "Tax ID";
}

export function formatTaxIdentifier(identifier: TaxIdentifier | null | undefined) {
  return identifier ? `${taxIdentifierLabel(identifier)}: ${identifier.value}` : null;
}
