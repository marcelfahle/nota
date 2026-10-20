"use client";

import { useTranslations } from "next-intl";
import { useOptimistic, useState, useTransition } from "react";

import { updateTheme } from "@/actions/theme";

export function ThemeSettings({ theme }: { theme: "system" | "light" | "dark" }) {
  const t = useTranslations("settings.theme");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [selectedTheme, setSelectedTheme] = useOptimistic<string>(theme);

  return (
    <section aria-labelledby="appearance-heading" className="space-y-3">
      <h2 className="text-sm font-semibold" id="appearance-heading">
        {t("heading")}
      </h2>
      <p className="text-sm text-muted-foreground">{t("description")}</p>
      <div className="flex items-center gap-4 text-sm">
        <label htmlFor="theme-preference">{t("label")}</label>
        <select
          className="rounded-md border border-input bg-card px-3 py-2"
          disabled={pending}
          id="theme-preference"
          onChange={(event) => {
            const value = event.target.value;
            setError("");
            startTransition(async () => {
              setSelectedTheme(value);
              try {
                await updateTheme(value);
              } catch {
                setError(t("error"));
              }
            });
          }}
          value={selectedTheme}
        >
          <option value="system">{t("system")}</option>
          <option value="light">{t("light")}</option>
          <option value="dark">{t("dark")}</option>
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
