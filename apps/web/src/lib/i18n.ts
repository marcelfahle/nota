import { createTranslator, type NamespaceKeys, type NestedKeyOf } from "next-intl";

import type { Locale } from "@/lib/utils";

import de from "../../messages/de.json";
import en from "../../messages/en.json";

/** The languages Nota speaks: the UI language of a person, the document language of a workspace. */
export const APP_LOCALES = ["en", "de"] as const;
export type AppLocale = (typeof APP_LOCALES)[number];

type Messages = typeof en;
type MessageTree = Record<string, unknown>;

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && (APP_LOCALES as ReadonlyArray<string>).includes(value);
}

/** The Intl locale that formats numbers and dates for an app locale. */
export function toIntlLocale(locale: AppLocale): Locale {
  return locale === "de" ? "de-DE" : "en-US";
}

/** The first supported language in an Accept-Language header, English otherwise. */
export function localeFromAcceptLanguage(header: string | null | undefined): AppLocale {
  for (const part of (header ?? "").split(",")) {
    const tag = part.split(";")[0].trim().toLowerCase();
    if (!tag) {
      continue;
    }
    const language = tag.split("-")[0];
    if (isAppLocale(language)) {
      return language;
    }
  }
  return "en";
}

/** Workspaces in Germany and Austria start with German documents. */
export function defaultDocumentLocale(org: {
  country?: string | null;
  countryCode?: string | null;
}) {
  const code = org.countryCode?.trim().toUpperCase();
  if (code) {
    return code === "DE" || code === "AT" ? "de" : "en";
  }
  const country = org.country?.trim().toLowerCase() ?? "";
  return ["at", "austria", "de", "deutschland", "germany", "oesterreich", "österreich"].includes(
    country,
  )
    ? "de"
    : "en";
}

/**
 * The language an invoice is written in: the snapshot taken at issuance, or
 * the workspace setting while it is still a draft.
 */
export function documentLocaleOf(
  invoice: { documentLocale?: string | null },
  org: { documentLocale?: string | null },
): AppLocale {
  if (isAppLocale(invoice.documentLocale)) {
    return invoice.documentLocale;
  }
  return isAppLocale(org.documentLocale) ? org.documentLocale : "en";
}

export function mergeMessages(base: MessageTree, overrides: MessageTree): MessageTree {
  const merged: MessageTree = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    const current = merged[key];
    merged[key] =
      value && typeof value === "object" && current && typeof current === "object"
        ? mergeMessages(current as MessageTree, value as MessageTree)
        : value;
  }
  return merged;
}

const german = mergeMessages(en, de) as Messages;

/** Every key exists in English; a translation that is missing falls back to it. */
export function messagesFor(locale: AppLocale): Messages {
  return locale === "de" ? german : en;
}

/**
 * A translator for code that runs outside a request: PDFs, emails and the
 * public invoice page, which speak the document language, not the viewer's.
 */
export function getTranslator<Namespace extends NamespaceKeys<Messages, NestedKeyOf<Messages>>>(
  locale: AppLocale,
  namespace?: Namespace,
) {
  return createTranslator({ locale, messages: messagesFor(locale), namespace });
}

/** A country name in the given language, or the code when it is not a known region. */
export function countryName(code: string | null | undefined, locale: AppLocale) {
  const region = code?.trim().toUpperCase();
  if (!region || !/^[A-Z]{2}$/.test(region)) {
    return code ?? null;
  }
  try {
    return (
      new Intl.DisplayNames([locale], { fallback: "code", type: "region" }).of(region) ?? region
    );
  } catch {
    return region;
  }
}
