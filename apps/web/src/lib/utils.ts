import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: Array<ClassValue>) {
  return twMerge(clsx(inputs));
}

export type Locale = "de-DE" | "en-US";

const GERMAN_SPEAKING_COUNTRIES = new Set([
  "at",
  "austria",
  "de",
  "deutschland",
  "germany",
  "oesterreich",
  "österreich",
]);

/** Display locale for a workspace: de-DE for Germany and Austria, en-US otherwise. */
export function orgLocale(org: { country?: string | null } | null | undefined): Locale {
  const country = org?.country?.trim().toLowerCase() ?? "";
  return GERMAN_SPEAKING_COUNTRIES.has(country) ? "de-DE" : "en-US";
}

export function formatCurrency(amount: number, currency = "EUR", locale: Locale = "en-US"): string {
  return new Intl.NumberFormat(locale, {
    currency,
    style: "currency",
  }).format(amount);
}

export function formatNumber(amount: number, locale: Locale = "en-US"): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(amount);
}

/**
 * Formats a calendar date (YYYY-MM-DD) or timestamp for display. Calendar dates have no
 * time zone, so they are always read and shown in UTC to avoid drifting a day.
 */
export function formatDate(
  value: string | Date,
  locale: Locale = "en-US",
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" },
): string {
  const date =
    typeof value === "string"
      ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value)
      : value;
  return new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...options }).format(date);
}
