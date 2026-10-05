export type DecimalInput = number | string;

type Decimal = {
  coefficient: bigint;
  scale: number;
};

const DECIMAL_PATTERN = /^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i;
const SUPPORTED_CURRENCY_EXPONENTS = new Set([0, 2, 3, 4]);

function powerOfTen(exponent: number) {
  return BigInt(10) ** BigInt(exponent);
}

function parseDecimal(value: DecimalInput): Decimal {
  const text = typeof value === "number" ? String(value) : value.trim();
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("Amount must be a finite decimal");
  }
  const match = DECIMAL_PATTERN.exec(text);
  if (!match) {
    throw new Error("Amount must be a decimal number");
  }

  const fraction = match[3] ?? "";
  const exponent = Number(match[4] ?? 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 100) {
    throw new Error("Decimal exponent is out of range");
  }
  let coefficient = BigInt(`${match[2]}${fraction}` || "0");
  if (match[1] === "-") {
    coefficient = -coefficient;
  }
  const scale = fraction.length - exponent;
  if (scale < 0) {
    return { coefficient: coefficient * powerOfTen(-scale), scale: 0 };
  }
  return { coefficient, scale };
}

function rescale(decimal: Decimal, scale: number, rounding: "half-up" | "reject") {
  if (decimal.scale <= scale) {
    return decimal.coefficient * powerOfTen(scale - decimal.scale);
  }
  const divisor = powerOfTen(decimal.scale - scale);
  const absolute = decimal.coefficient < 0 ? -decimal.coefficient : decimal.coefficient;
  const remainder = absolute % divisor;
  if (rounding === "reject" && remainder !== BigInt(0)) {
    throw new Error(`Amount has more than ${scale} decimal places`);
  }
  const rounded = absolute / divisor + (remainder * BigInt(2) >= divisor ? BigInt(1) : BigInt(0));
  return decimal.coefficient < 0 ? -rounded : rounded;
}

function fromScaledInteger(value: bigint, scale: number) {
  const negative = value < 0;
  const digits = (negative ? -value : value).toString().padStart(scale + 1, "0");
  const formatted = scale === 0 ? digits : `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
  return negative ? `-${formatted}` : formatted;
}

export function formatMinorUnits(value: number | string, scale: number) {
  const text = String(value);
  if (!/^-?\d+$/.test(text)) {
    throw new Error("Minor-unit amount must be an integer");
  }
  return fromScaledInteger(BigInt(text), scale);
}

export function currencyExponent(currency: string): number {
  const normalized = currency.trim().toUpperCase();
  if (!Intl.supportedValuesOf("currency").includes(normalized)) {
    throw new Error(`Unsupported currency: ${currency}`);
  }
  const exponent =
    new Intl.NumberFormat("en", {
      currency: normalized,
      style: "currency",
    }).resolvedOptions().maximumFractionDigits ?? 2;
  if (!SUPPORTED_CURRENCY_EXPONENTS.has(exponent)) {
    throw new Error(`Currency ${normalized} uses an unsupported ${exponent}-decimal exponent`);
  }
  return exponent;
}

export function formatDecimal(
  value: DecimalInput,
  scale: number,
  rounding: "half-up" | "reject" = "half-up",
) {
  return fromScaledInteger(rescale(parseDecimal(value), scale, rounding), scale);
}

export function formatVariableDecimal(value: DecimalInput, maximumScale: number, minimumScale = 0) {
  const fixed = formatDecimal(value, maximumScale, "reject");
  if (maximumScale === minimumScale) {
    return fixed;
  }
  const [integer, fraction = ""] = fixed.split(".");
  const trimmed = fraction.replace(/0+$/, "").padEnd(minimumScale, "0");
  return trimmed ? `${integer}.${trimmed}` : integer;
}

export function addDecimals(values: Array<DecimalInput>, scale: number) {
  const total = values.reduce(
    (sum, value) => sum + rescale(parseDecimal(value), scale, "reject"),
    BigInt(0),
  );
  return fromScaledInteger(total, scale);
}

export function subtractDecimals(left: DecimalInput, right: DecimalInput, scale: number) {
  const result =
    rescale(parseDecimal(left), scale, "reject") - rescale(parseDecimal(right), scale, "reject");
  return fromScaledInteger(result, scale);
}

export function multiplyAndRound(left: DecimalInput, right: DecimalInput, scale: number) {
  const a = parseDecimal(left);
  const b = parseDecimal(right);
  return fromScaledInteger(
    rescale(
      { coefficient: a.coefficient * b.coefficient, scale: a.scale + b.scale },
      scale,
      "half-up",
    ),
    scale,
  );
}

export function percentageAndRound(value: DecimalInput, rate: DecimalInput, scale: number) {
  const amount = parseDecimal(value);
  const percentage = parseDecimal(rate);
  return fromScaledInteger(
    rescale(
      {
        coefficient: amount.coefficient * percentage.coefficient,
        scale: amount.scale + percentage.scale + 2,
      },
      scale,
      "half-up",
    ),
    scale,
  );
}

export function compareDecimals(left: DecimalInput, right: DecimalInput, scale: number) {
  const a = rescale(parseDecimal(left), scale, "reject");
  const b = rescale(parseDecimal(right), scale, "reject");
  return a < b ? -1 : a > b ? 1 : 0;
}

export function negateDecimal(value: DecimalInput, scale: number) {
  return fromScaledInteger(-rescale(parseDecimal(value), scale, "reject"), scale);
}

export function absoluteDecimal(value: DecimalInput, scale: number) {
  const amount = rescale(parseDecimal(value), scale, "reject");
  return fromScaledInteger(amount < 0 ? -amount : amount, scale);
}

export function formatCurrencyDecimal(
  value: DecimalInput,
  currency: string,
  rounding: "half-up" | "reject" = "half-up",
) {
  return formatDecimal(value, currencyExponent(currency), rounding);
}

/** Format persisted money without making legacy rows unreadable or changing their value. */
export function formatStoredMoney(value: DecimalInput, currency: string) {
  try {
    return formatCurrencyDecimal(value, currency, "reject");
  } catch {
    return formatVariableDecimal(value, 4, 2);
  }
}
