import { getRequestConfig } from "next-intl/server";
import { headers } from "next/headers";

import { getCurrentSessionUser } from "@/lib/auth";
import { isAppLocale, localeFromAcceptLanguage, messagesFor, type AppLocale } from "@/lib/i18n";

/**
 * The UI language of one request: the signed-in person's choice, otherwise
 * the browser's. The admin area and the API stay English. There is no locale
 * in the URL; documents have their own language, set per workspace.
 */
async function resolveLocale(): Promise<AppLocale> {
  const user = await getCurrentSessionUser();
  if (user?.isSuperAdmin) {
    return "en";
  }
  if (user && isAppLocale(user.locale)) {
    return user.locale;
  }
  return localeFromAcceptLanguage((await headers()).get("accept-language"));
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  return { locale, messages: messagesFor(locale) };
});
