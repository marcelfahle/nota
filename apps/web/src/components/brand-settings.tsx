"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState, useEffect, useMemo, useState, type ChangeEvent } from "react";

import { updateBrandSettings } from "@/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isAppLocale, toIntlLocale, type AppLocale } from "@/lib/i18n";
import {
  taxIdentifierFromColumns,
  taxIdentifierLabel,
  type TaxIdentifierType,
} from "@/lib/tax-identifier";
import { TAX_TREATMENTS, type TaxTreatment } from "@/lib/tax-treatment";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

type Source = {
  confirmed: boolean;
  detail?: string;
  source: "registry" | "search" | "site" | "user";
};

export type BrandSettingsData = {
  brandColor: string | null;
  businessName: string | null;
  city: string | null;
  contactEmail: string | null;
  contactName: string | null;
  contactPhone: string | null;
  country: string | null;
  countryCode: string | null;
  defaultTaxTreatment: TaxTreatment;
  faviconUrl: string | null;
  invoiceLayout: string;
  legalName: string | null;
  logoUrl: string | null;
  name: string;
  postalCode: string | null;
  profileSources: Record<string, Source & { at: string }> | null;
  region: string | null;
  street: string | null;
  taxIdentifierCountryCode: string | null;
  taxIdentifierType: TaxIdentifierType | null;
  taxIdentifierValue: string | null;
  vatNumber: string | null;
  website: string | null;
};

type BrandField = Exclude<
  keyof BrandSettingsData,
  "faviconUrl" | "logoUrl" | "profileSources" | "taxIdentifierCountryCode" | "vatNumber"
>;

const SWATCHES = ["#43C6A6", "#1F1B16", "#14705A"];
const PAPER_INK = "#1F1B16";

function relativeLuminance(color: string) {
  const normalized = color.replace(/^#([\da-f])([\da-f])([\da-f])$/i, "#$1$1$2$2$3$3");
  const channels = normalized.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i)?.slice(1);
  if (!channels) {
    return null;
  }

  const [red, green, blue] = channels.map((channel) => Number.parseInt(channel, 16) / 255);
  return [red, green, blue]
    .map((channel) => (channel <= 0.040_45 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
    .reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0);
}

const PAPER_INK_LUMINANCE = relativeLuminance(PAPER_INK)!;

function contrastTextColor(background: string) {
  const luminance = relativeLuminance(background);
  if (luminance === null) {
    return PAPER_INK;
  }

  const inkContrast =
    (Math.max(luminance, PAPER_INK_LUMINANCE) + 0.05) /
    (Math.min(luminance, PAPER_INK_LUMINANCE) + 0.05);
  const whiteContrast = 1.05 / (luminance + 0.05);

  return inkContrast >= whiteContrast ? PAPER_INK : "#FFFFFF";
}

type Translate = ReturnType<typeof useTranslations<"settings.brand">>;

function sourceLabel(source: Source | undefined, t: Translate) {
  if (!source) {
    return t("source.notPublic");
  }
  if (source.source === "user") {
    return t("source.confirmed");
  }
  const origin = source.detail ?? t(`source.${source.source}`);
  return source.confirmed ? t("source.withConfirmed", { source: origin }) : origin;
}

function usePreviewUrl(file: File | null) {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    return () => {
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [url]);
  return url;
}

export function BrandSettings({
  canManage,
  settings,
}: {
  canManage: boolean;
  settings: BrandSettingsData;
}) {
  const t = useTranslations("settings.brand");
  const tTreatment = useTranslations("taxTreatment");
  const requestLocale = useLocale();
  const language: AppLocale = isAppLocale(requestLocale) ? requestLocale : "en";
  const locale = toIntlLocale(language);
  const savedTaxIdentifier = taxIdentifierFromColumns(settings);
  const initial = useMemo(
    () => ({
      brandColor: settings.brandColor ?? SWATCHES[0],
      businessName: settings.businessName ?? "",
      city: settings.city ?? "",
      contactEmail: settings.contactEmail ?? "",
      contactName: settings.contactName ?? "",
      contactPhone: settings.contactPhone ?? "",
      country: settings.country ?? "",
      countryCode: settings.countryCode ?? "",
      defaultTaxTreatment: settings.defaultTaxTreatment,
      invoiceLayout: "classic",
      legalName: settings.legalName ?? "",
      name: settings.name,
      postalCode: settings.postalCode ?? "",
      region: settings.region ?? "",
      street: settings.street ?? "",
      taxIdentifierType: savedTaxIdentifier?.type ?? "tax_id",
      taxIdentifierValue: savedTaxIdentifier?.value ?? "",
      website: settings.website ?? "",
    }),
    [savedTaxIdentifier, settings],
  );
  const [values, setValues] = useState(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [dirty, setDirty] = useState<Set<BrandField>>(new Set());
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [faviconFile, setFaviconFile] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [removeFavicon, setRemoveFavicon] = useState(false);
  const [state, formAction, pending] = useActionState(updateBrandSettings, null);
  const logoPreview = usePreviewUrl(logoFile);
  const faviconPreview = usePreviewUrl(faviconFile);

  function change(field: BrandField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setDirty((current) => new Set(current).add(field));
  }

  const address = [
    values.street,
    [values.postalCode, values.city].filter(Boolean).join(" "),
    values.region,
    values.country,
  ].filter(Boolean);
  const currentLogo = removeLogo ? null : (logoPreview ?? settings.logoUrl);
  const currentFavicon = removeFavicon ? null : (faviconPreview ?? settings.faviconUrl);

  const fields: Array<{
    field: BrandField;
    label: string;
    placeholder: string;
    type?: "email" | "url";
  }> = [
    {
      field: "businessName",
      label: t("fields.businessName"),
      placeholder: t("placeholders.businessName"),
    },
    { field: "name", label: t("fields.name"), placeholder: t("placeholders.name") },
    {
      field: "contactName",
      label: t("fields.contactName"),
      placeholder: t("placeholders.contactName"),
    },
    {
      field: "contactEmail",
      label: t("fields.contactEmail"),
      placeholder: t("placeholders.contactEmail"),
      type: "email",
    },
    {
      field: "contactPhone",
      label: t("fields.contactPhone"),
      placeholder: t("placeholders.contactPhone"),
    },
    {
      field: "taxIdentifierValue",
      label: taxIdentifierLabel({ type: values.taxIdentifierType as TaxIdentifierType }, language),
      placeholder:
        values.taxIdentifierType === "us_ein"
          ? t("placeholders.ein")
          : values.taxIdentifierType === "eu_vat"
            ? t("placeholders.vat")
            : t("placeholders.taxId"),
    },
    { field: "legalName", label: t("fields.legalName"), placeholder: t("placeholders.legalName") },
    { field: "street", label: t("fields.street"), placeholder: t("placeholders.street") },
  ];

  return (
    <form action={formAction} className="space-y-7" encType="multipart/form-data">
      <input name="dirtyFields" type="hidden" value={[...dirty].join(",")} />
      <input name="invoiceLayout" type="hidden" value="classic" />
      <input name="removeLogo" type="hidden" value={String(removeLogo)} />
      <input name="removeFavicon" type="hidden" value={String(removeFavicon)} />
      {Object.entries(values).map(([name, value]) => (
        <input key={name} name={name} type="hidden" value={value} />
      ))}

      <div className="flex items-center gap-3">
        <label className="text-sm text-muted-foreground" htmlFor="brand-tax-identifier-type">
          {t("taxIdType")}
        </label>
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          disabled={!canManage}
          id="brand-tax-identifier-type"
          onChange={(event) => {
            change("taxIdentifierType", event.target.value);
            setDirty((current) => new Set(current).add("taxIdentifierValue"));
          }}
          value={values.taxIdentifierType}
        >
          <option value="eu_vat">{t("euVat")}</option>
          <option value="us_ein">{t("usEin")}</option>
          <option value="tax_id">{t("taxId")}</option>
        </select>
      </div>

      {!canManage ? (
        <p className="rounded-md border bg-secondary px-4 py-3 text-sm text-muted-foreground">
          {t("readOnly")}
        </p>
      ) : null}

      <div className="grid items-start gap-9 lg:grid-cols-[minmax(0,3fr)_minmax(270px,2fr)]">
        <div className="min-w-0 space-y-7">
          <section aria-labelledby="brand-identity-heading">
            <h2 className="nota-label border-b pb-2.5 text-foreground" id="brand-identity-heading">
              {t("from")}
            </h2>
            {fields.map(({ field, label, placeholder, type }) => {
              const value = values[field];
              const open = editing === field;
              return (
                <div className="border-b py-3" data-testid={`brand-field-${field}`} key={field}>
                  <div className="grid items-center gap-2 sm:grid-cols-[92px_minmax(0,1fr)_auto_auto]">
                    <span className="text-sm text-muted-foreground">{label}</span>
                    <span
                      className={cn(
                        "min-w-0 text-sm font-medium",
                        !value && "text-muted-foreground italic",
                      )}
                    >
                      {value || placeholder}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {sourceLabel(settings.profileSources?.[field], t)}
                    </span>
                    <Button
                      aria-label={t("editLabel", {
                        action: open ? t("finishEditing") : value ? t("edit") : t("add"),
                        label,
                      })}
                      className={cn(
                        !value &&
                          "border-foreground !bg-[#d1fd39] !text-[#191510] hover:!bg-[#c0ed2f]",
                      )}
                      disabled={!canManage}
                      onClick={() => setEditing(open ? null : field)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {open ? t("done") : value ? t("edit") : t("add")}
                    </Button>
                  </div>
                  {open ? (
                    <Input
                      autoFocus
                      className="mt-3"
                      onChange={(event) => change(field, event.target.value)}
                      placeholder={placeholder}
                      type={type ?? "text"}
                      value={value}
                    />
                  ) : null}
                </div>
              );
            })}
            <div className="border-b py-3">
              <div className="grid items-center gap-2 sm:grid-cols-[92px_minmax(0,1fr)_auto_auto]">
                <span className="text-sm text-muted-foreground">{t("fields.city")}</span>
                <span
                  className={cn(
                    "text-sm font-medium",
                    !values.city && "text-muted-foreground italic",
                  )}
                >
                  {[values.city, values.region, values.country || values.countryCode]
                    .filter(Boolean)
                    .join(", ") || t("placeholders.city")}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {sourceLabel(settings.profileSources?.city, t)}
                </span>
                <Button
                  aria-label={t("editLabel", {
                    action:
                      editing === "address"
                        ? t("finishEditing")
                        : values.city
                          ? t("edit")
                          : t("add"),
                    label: t("fields.city"),
                  })}
                  className={cn(
                    !values.city &&
                      "border-foreground !bg-[#d1fd39] !text-[#191510] hover:!bg-[#c0ed2f]",
                  )}
                  disabled={!canManage}
                  onClick={() => setEditing(editing === "address" ? null : "address")}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {editing === "address" ? t("done") : values.city ? t("edit") : t("add")}
                </Button>
              </div>
              {editing === "address" ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {(["postalCode", "city", "region", "country", "countryCode"] as const).map(
                    (field) => (
                      <label className="space-y-1 text-xs text-muted-foreground" key={field}>
                        {t(`address.${field}`)}
                        <Input
                          onChange={(event) => change(field, event.target.value)}
                          value={values[field]}
                        />
                      </label>
                    ),
                  )}
                </div>
              ) : null}
            </div>
            <div className="border-b py-3" data-testid="brand-field-defaultTaxTreatment">
              <div className="grid items-center gap-2 sm:grid-cols-[92px_minmax(0,1fr)_auto_auto]">
                <label className="text-sm text-muted-foreground" htmlFor="brand-tax-treatment">
                  {t("vat")}
                </label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  disabled={!canManage}
                  id="brand-tax-treatment"
                  onChange={(event) => change("defaultTaxTreatment", event.target.value)}
                  value={values.defaultTaxTreatment}
                >
                  {TAX_TREATMENTS.map((treatment) => (
                    <option key={treatment} value={treatment}>
                      {tTreatment(`labels.${treatment}`)}
                    </option>
                  ))}
                </select>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {sourceLabel(settings.profileSources?.defaultTaxTreatment, t)}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("newInvoicesStart")}{" "}
                {tTreatment(`hints.${values.defaultTaxTreatment as TaxTreatment}`)}
              </p>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{t("tellNota")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("germanNeeds")}</p>
          </section>

          <section aria-labelledby="brand-appearance-heading">
            <h2
              className="nota-label border-b pb-2.5 text-foreground"
              id="brand-appearance-heading"
            >
              {t("looks")}
            </h2>
            <div className="grid items-center gap-3 border-b py-3 sm:grid-cols-[92px_minmax(0,1fr)_auto]">
              <span className="text-sm text-muted-foreground">{t("logo")}</span>
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center overflow-hidden rounded-lg border bg-secondary">
                  {currentLogo ? (
                    <img
                      alt={t("currentLogo")}
                      className="size-full object-contain"
                      src={currentLogo}
                    />
                  ) : (
                    <span className="text-xs">—</span>
                  )}
                </span>
                <span className="grid size-7 place-items-center overflow-hidden rounded border bg-secondary">
                  {currentFavicon ? (
                    <img
                      alt={t("currentFavicon")}
                      className="size-full object-contain"
                      src={currentFavicon}
                    />
                  ) : (
                    <span className="text-xs">—</span>
                  )}
                </span>
                <span className="text-sm text-muted-foreground">{t("logoAndFavicon")}</span>
              </div>
              <Button
                disabled={!canManage}
                onClick={() => setEditing(editing === "assets" ? null : "assets")}
                size="sm"
                type="button"
                variant="outline"
              >
                {editing === "assets" ? t("done") : t("replace")}
              </Button>
              <div
                className={cn(
                  "space-y-3 sm:col-span-2 sm:col-start-2",
                  editing !== "assets" && "hidden",
                )}
              >
                <label className="block space-y-1 text-xs text-muted-foreground">
                  {t("logo")}
                  <Input
                    accept="image/png,image/jpeg,image/webp"
                    key={`logo-${removeLogo}`}
                    name="logoFile"
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      setLogoFile(event.target.files?.[0] ?? null);
                      setRemoveLogo(false);
                    }}
                    type="file"
                  />
                </label>
                <label className="block space-y-1 text-xs text-muted-foreground">
                  {t("favicon")}
                  <Input
                    accept="image/png,image/jpeg,image/webp"
                    key={`favicon-${removeFavicon}`}
                    name="faviconFile"
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      setFaviconFile(event.target.files?.[0] ?? null);
                      setRemoveFavicon(false);
                    }}
                    type="file"
                  />
                </label>
                <div className="flex gap-2">
                  {currentLogo ? (
                    <Button
                      onClick={() => {
                        setLogoFile(null);
                        setRemoveLogo(true);
                      }}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      {t("removeLogo")}
                    </Button>
                  ) : null}
                  {currentFavicon ? (
                    <Button
                      onClick={() => {
                        setFaviconFile(null);
                        setRemoveFavicon(true);
                      }}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      {t("removeFavicon")}
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="grid items-center gap-3 border-b py-3 sm:grid-cols-[92px_minmax(0,1fr)_auto]">
              <span className="text-sm text-muted-foreground">{t("payButton")}</span>
              <div className="flex items-center gap-3">
                {SWATCHES.map((color) => (
                  <button
                    aria-label={t("brandColour", { color })}
                    aria-pressed={values.brandColor.toUpperCase() === color}
                    className="size-7 rounded-full border"
                    key={color}
                    onClick={() => change("brandColor", color)}
                    style={{
                      backgroundColor: color,
                      boxShadow:
                        values.brandColor.toUpperCase() === color
                          ? "0 0 0 2px var(--paper), 0 0 0 4px var(--ink)"
                          : undefined,
                    }}
                    type="button"
                  />
                ))}
                <Input
                  aria-label={t("customColour")}
                  className="h-8 w-28 font-mono text-xs uppercase"
                  maxLength={7}
                  onChange={(event) => change("brandColor", event.target.value)}
                  value={values.brandColor}
                />
              </div>
              <span className="font-mono text-[11px] text-muted-foreground">{t("stylesheet")}</span>
            </div>
            <div className="grid items-center gap-3 border-b py-3 sm:grid-cols-[92px_minmax(0,1fr)]">
              <span className="text-sm text-muted-foreground">{t("layout")}</span>
              <Button className="w-fit" size="sm" type="button">
                {t("classic")}
              </Button>
            </div>
          </section>
        </div>

        <aside className="space-y-3 lg:sticky lg:top-7">
          <p className="nota-label border-b pb-2.5 text-foreground">{t("livePreview")}</p>
          <div className="border bg-secondary p-5">
            <div
              className="invoice-paper -rotate-1 space-y-7 border p-6 shadow-sm"
              data-testid="brand-invoice-preview"
            >
              <div className="flex justify-between gap-5">
                <div className="space-y-1 text-[10px] leading-4">
                  {currentLogo ? (
                    <img
                      alt=""
                      className="mb-2 h-8 w-auto max-w-24 object-contain"
                      src={currentLogo}
                    />
                  ) : null}
                  <p className="text-sm font-semibold">{values.businessName || values.name}</p>
                  {address.length ? (
                    address.map((line) => <p key={line}>{line}</p>)
                  ) : (
                    <p className="bg-highlighter px-1">{t("streetAddress")}</p>
                  )}
                  {values.taxIdentifierValue ? (
                    <p>
                      {taxIdentifierLabel(
                        { type: values.taxIdentifierType as TaxIdentifierType },
                        language,
                      )}{" "}
                      {values.taxIdentifierValue}
                    </p>
                  ) : (
                    <p className="bg-highlighter px-1">{t("taxIdMissing")}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-2xl font-semibold">{t("preview.invoice")}</p>
                  <p className="font-mono text-[10px]" style={{ color: values.brandColor }}>
                    INV-0042
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-[9px]">
                <div>
                  <p className="nota-label mb-1">{t("preview.billedTo")}</p>
                  <p className="font-semibold">Ovilo GmbH</p>
                  <p>Berlin</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="nota-label mb-1">{t("preview.issued")}</p>
                    <p>{formatDate("2026-09-30", locale)}</p>
                  </div>
                  <div>
                    <p className="nota-label mb-1">{t("preview.due")}</p>
                    <p>{formatDate("2026-10-30", locale)}</p>
                  </div>
                </div>
              </div>
              <div className="text-[9px]">
                <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b pb-2 font-mono text-[8px] text-muted-foreground uppercase">
                  <span>{t("preview.description")}</span>
                  <span>{t("preview.qty")}</span>
                  <span>{t("preview.amount")}</span>
                </div>
                <div className="grid grid-cols-[1fr_auto_auto] gap-3 py-2">
                  <span>{t("preview.item")}</span>
                  <span>12</span>
                  <span>{formatCurrency(4800, "EUR", locale)}</span>
                </div>
              </div>
              <div className="ml-auto w-3/5 space-y-1 text-[9px]">
                <div className="flex justify-between">
                  <span>{t("preview.subtotal")}</span>
                  <span>{formatCurrency(4800, "EUR", locale)}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t("preview.vat")}</span>
                  <span>{formatCurrency(0, "EUR", locale)}</span>
                </div>
                <div className="flex justify-between border-t pt-2 text-sm font-semibold">
                  <span>{t("preview.totalDue")}</span>
                  <span>{formatCurrency(4800, "EUR", locale)}</span>
                </div>
              </div>
              <div
                className="rounded px-3 py-2 text-center text-[10px] font-semibold"
                style={{
                  backgroundColor: values.brandColor,
                  color: contrastTextColor(values.brandColor),
                }}
              >
                {t("preview.pay", { amount: formatCurrency(4800, "EUR", locale) })}
              </div>
            </div>
          </div>
          <Button
            className="w-full"
            disabled
            title={t("testInvoiceUnavailable")}
            type="button"
            variant="outline"
          >
            {t("testInvoice")}
          </Button>
        </aside>
      </div>

      <div className="flex items-center gap-3 border-t pt-5">
        <Button
          disabled={
            !canManage ||
            pending ||
            (!dirty.size && !logoFile && !faviconFile && !removeLogo && !removeFavicon)
          }
          type="submit"
        >
          {pending ? t("saving") : t("save")}
        </Button>
        {state?.error ? (
          <p className="text-sm text-destructive" role="alert">
            {state.error}
          </p>
        ) : null}
        {state?.success ? (
          <p className="text-sm" role="status">
            {t("saved")}
          </p>
        ) : null}
      </div>
    </form>
  );
}
