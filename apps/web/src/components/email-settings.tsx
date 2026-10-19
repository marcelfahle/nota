"use client";

import { useTranslations } from "next-intl";
import { useOptimistic, useState, useTransition } from "react";

import { updateDocumentLocale, updateEInvoiceDelivery } from "@/actions/settings";
import { attachesXRechnung, type EInvoiceDelivery } from "@/lib/e-invoice-delivery";
import { APP_LOCALES, type AppLocale } from "@/lib/i18n";

export function EmailSettings({
  canManage,
  documentLocale,
  eInvoiceDelivery,
}: {
  canManage: boolean;
  documentLocale: AppLocale;
  eInvoiceDelivery: EInvoiceDelivery;
}) {
  const t = useTranslations("settings");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [delivery, setDelivery] = useOptimistic<EInvoiceDelivery>(eInvoiceDelivery);
  const [language, setLanguage] = useOptimistic<AppLocale>(documentLocale);

  return (
    <section aria-labelledby="email-settings-heading" className="space-y-5">
      <h2 className="text-lg font-semibold" id="email-settings-heading">
        {t("email.heading")}
      </h2>
      <div className="space-y-2 text-sm">
        <label className="block font-medium" htmlFor="document-language">
          {t("documentLanguage.label")}
        </label>
        <select
          className="rounded-md border border-input bg-card px-3 py-2"
          data-testid="settings-document-language"
          disabled={!canManage || pending}
          id="document-language"
          onChange={(event) => {
            const value = event.target.value as AppLocale;
            setError("");
            startTransition(async () => {
              setLanguage(value);
              const result = await updateDocumentLocale(value);
              if (result?.error) {
                setError(result.error);
              }
            });
          }}
          value={language}
        >
          {APP_LOCALES.map((option) => (
            <option key={option} value={option}>
              {t(`documentLanguage.${option}`)}
            </option>
          ))}
        </select>
        <p className="text-muted-foreground">{t("documentLanguage.hint")}</p>
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input
          checked={attachesXRechnung(delivery)}
          className="mt-0.5 size-4 rounded border-zinc-300"
          data-testid="settings-einvoice-delivery"
          disabled={!canManage || pending}
          onChange={(event) => {
            const value: EInvoiceDelivery = event.target.checked ? "pdf_and_xrechnung" : "pdf_only";
            setError("");
            startTransition(async () => {
              setDelivery(value);
              const result = await updateEInvoiceDelivery(value);
              if (result?.error) {
                setError(result.error);
              }
            });
          }}
          type="checkbox"
        />
        <span>
          <span className="font-medium">{t("email.attachXml")}</span>{" "}
          <span className="text-muted-foreground">{t("email.attachXmlHint")}</span>
        </span>
      </label>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
