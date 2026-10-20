"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";

import { updateUserLocale } from "@/actions/settings";
import { APP_LOCALES, type AppLocale } from "@/lib/i18n";

export function LanguageSettings({ locale }: { locale: AppLocale }) {
  const t = useTranslations("settings.language");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [selected, setSelected] = useOptimistic<AppLocale>(locale);

  return (
    <section aria-labelledby="language-heading" className="space-y-3">
      <h2 className="text-sm font-semibold" id="language-heading">
        {t("heading")}
      </h2>
      <p className="text-sm text-muted-foreground">{t("description")}</p>
      <div className="flex items-center gap-4 text-sm">
        <label htmlFor="language-preference">{t("label")}</label>
        <select
          className="rounded-md border border-input bg-card px-3 py-2"
          data-testid="settings-language"
          disabled={pending}
          id="language-preference"
          onChange={(event) => {
            const value = event.target.value as AppLocale;
            setError("");
            startTransition(async () => {
              setSelected(value);
              const result = await updateUserLocale(value);
              if (result?.error) {
                setError(t("error"));
                return;
              }
              router.refresh();
            });
          }}
          value={selected}
        >
          {APP_LOCALES.map((option) => (
            <option key={option} value={option}>
              {t(option)}
            </option>
          ))}
        </select>
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
