"use client";

import { Check, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ADDRESS_FIELDS, addressNeedsReview } from "@/lib/onboarding-address";
import type { ProfileFieldKey, SiteProfile } from "@/lib/site-reader/types";
import type { TaxIdentifierType } from "@/lib/tax-identifier";
import { cn } from "@/lib/utils";

import type { SiteRead, VatReply } from "./use-site-read";

// ISO codes VIES answers for. Everyone else has a tax ID, not an EU VAT ID.
const EU = new Set(
  "AT BE BG CY CZ DE DK EE EL GR ES FI FR HR HU IE IT LT LU LV MT NL PL PT RO SE SI SK XI".split(
    " ",
  ),
);

/** A found value, set in the sentence as a pill. Click it to change it. */
function Chip({
  field,
  label,
  onCommit,
  placeholder,
  value,
}: {
  field: ProfileFieldKey;
  label: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  const t = useTranslations("onboarding.chips");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      input.current?.select();
    }
  }, [editing]);

  if (editing) {
    const commit = () => {
      setEditing(false);
      if (draft.trim() !== value) {
        onCommit(draft);
      }
    };
    return (
      <input
        aria-label={label}
        className="onboarding-chip onboarding-chip-input"
        data-testid={`onboarding-edit-${field}`}
        onBlur={commit}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commit();
          }
          if (event.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        placeholder={placeholder ?? label}
        ref={input}
        style={{ width: `${Math.max(draft.length, (placeholder ?? label).length, 4) + 3}ch` }}
        value={draft}
      />
    );
  }
  return (
    <button
      aria-label={t("change", { label, value: value || t("notSet") })}
      className={cn("onboarding-chip", !value && "onboarding-chip-empty")}
      data-testid={`onboarding-chip-${field}`}
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      type="button"
    >
      {value || placeholder || label}
    </button>
  );
}

function Sentence({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <p className="onboarding-rise" data-testid={testId}>
      {children}
    </p>
  );
}

function Pending({ children }: { children: ReactNode }) {
  return (
    <p aria-hidden="true" className="onboarding-pending font-sans text-sm">
      {children}
    </p>
  );
}

function VatStep({ profile, read }: { profile: SiteProfile; read: SiteRead }) {
  const t = useTranslations("onboarding.vat");
  const tChips = useTranslations("onboarding.chips");
  const fields = profile.fields;
  const [value, setValue] = useState(profile.taxIdentifier?.value ?? fields.vatNumber?.value ?? "");
  const [pending, setPending] = useState(false);
  const [reply, setReply] = useState<VatReply | null>(null);
  const [error, setError] = useState<string | null>(null);
  const country = fields.countryCode?.value?.toUpperCase();
  const outsideEu = Boolean(country) && !EU.has(country!);
  const suggestedType = profile.taxIdentifier?.type ?? (outsideEu ? "tax_id" : "eu_vat");
  const [chosenType, setChosenType] = useState<TaxIdentifierType | null>(null);
  const type = chosenType ?? suggestedType;
  const hasLegal = Boolean(fields.legalName && fields.street);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!value.trim() || pending) {
      return;
    }
    setPending(true);
    setError(null);
    const result = await read.checkVat({ countryCode: country, type, value });
    setPending(false);
    if (typeof result === "string") {
      setReply(result);
    } else {
      setError(result.error);
    }
  }

  const fromRegistry = fields.legalName?.source === "registry";

  return (
    <div className="onboarding-rise space-y-3" data-testid="onboarding-vat">
      <p>
        {fromRegistry ? (
          <>
            {t("registryHasYou")}
            <Chip
              field="legalName"
              label={tChips("legalName")}
              onCommit={(next) => read.edit("legalName", next)}
              value={fields.legalName?.value ?? ""}
            />
            {fields.street ? (
              <>
                {t("at")}
                <Chip
                  field="street"
                  label={tChips("street")}
                  onCommit={(next) => read.edit("street", next)}
                  value={fields.street.value}
                />
              </>
            ) : null}
            .
          </>
        ) : hasLegal ? (
          <>
            {type === "us_ein" ? t("yourEin") : type === "eu_vat" ? t("yourVatId") : t("yourTaxId")}
            {fields.vatNumber
              ? type === "eu_vat"
                ? t("onSiteCheck")
                : t("onSiteConfirm")
              : t("notOnSite")}
          </>
        ) : outsideEu ? (
          <>{t("outsideEu")}</>
        ) : (
          <>{t("nothingPublic")}</>
        )}
      </p>

      <form className="flex flex-wrap items-center gap-2 font-sans" onSubmit={onSubmit}>
        <label className="sr-only" htmlFor="onboarding-tax-id-type">
          {t("typeLabel")}
        </label>
        <select
          className="h-11 rounded-md border border-input bg-card px-3 text-sm"
          id="onboarding-tax-id-type"
          onChange={(event) => {
            setChosenType(event.target.value as TaxIdentifierType);
            setReply(null);
          }}
          value={type}
        >
          <option value="eu_vat">{t("euVat")}</option>
          <option value="us_ein">{t("usEin")}</option>
          <option value="tax_id">{t("taxId")}</option>
        </select>
        <label className="sr-only" htmlFor="onboarding-vat-input">
          {type === "us_ein" ? t("ein") : type === "eu_vat" ? t("vatId") : t("taxId")}
        </label>
        <Input
          autoCapitalize="characters"
          autoComplete="off"
          className="h-11 max-w-[16rem] flex-1 bg-card font-mono tracking-wide uppercase placeholder:tracking-normal placeholder:normal-case md:text-sm"
          data-testid="onboarding-vat-input"
          id="onboarding-vat-input"
          onChange={(event) => {
            setValue(event.target.value);
            setReply(null);
          }}
          placeholder={
            type === "us_ein"
              ? "12-3456789"
              : type === "eu_vat"
                ? "ESB12345678"
                : t("taxIdOptional")
          }
          spellCheck={false}
          value={value}
        />
        <Button
          className="h-11 px-4"
          data-testid="onboarding-vat-submit"
          disabled={!value.trim() || pending}
          type="submit"
          variant="outline"
        >
          {pending ? <Loader2 className="animate-spin" /> : null}
          {type === "eu_vat" ? t("check") : t("save")}
        </Button>
      </form>

      {reply === "valid-with-details" ? (
        <p className="flex items-start gap-2 font-sans text-sm" data-testid="onboarding-vat-result">
          <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {t("validWithDetails")}
        </p>
      ) : reply ? (
        <p
          className={cn(
            "flex items-start gap-2 font-sans text-sm",
            reply === "invalid" ? "text-destructive" : "text-muted-foreground",
          )}
          data-testid="onboarding-vat-result"
        >
          {reply === "valid" || reply === "tax-id" ? (
            <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-foreground" />
          ) : null}
          {t(`messages.${reply}`)}
        </p>
      ) : null}
      {error ? <p className="font-sans text-sm text-destructive">{error}</p> : null}

      {reply === "valid" && !hasLegal ? (
        <p>
          {t("legalName")}
          <Chip
            field="legalName"
            label={tChips("legalName")}
            onCommit={(next) => read.edit("legalName", next)}
            placeholder={t("companyPlaceholder")}
            value={fields.legalName?.value ?? ""}
          />
          {t("registeredAt")}
          <Chip
            field="street"
            label={tChips("streetNumber")}
            onCommit={(next) => read.edit("street", next)}
            placeholder={tChips("streetNumber")}
            value={fields.street?.value ?? ""}
          />
          ,{" "}
          <Chip
            field="postalCode"
            label={tChips("postcode")}
            onCommit={(next) => read.edit("postalCode", next)}
            placeholder={tChips("postcode")}
            value={fields.postalCode?.value ?? ""}
          />{" "}
          <Chip
            field="city"
            label={tChips("city")}
            onCommit={(next) => read.edit("city", next)}
            placeholder={tChips("city")}
            value={fields.city?.value ?? ""}
          />
          .
        </p>
      ) : null}
    </div>
  );
}

/**
 * What the site told us, written as sentences. Each one appears when its data
 * lands; the faint lines below are the work still in flight.
 */
export function Meet({ read }: { read: SiteRead }) {
  const t = useTranslations("onboarding.sentences");
  const tChips = useTranslations("onboarding.chips");
  const { profile, status, steps } = read;
  if (!profile) {
    return null;
  }
  const fields = profile.fields;
  const reading = status === "reading";
  const location = fields.city ?? fields.country;
  const reviewLocation = addressNeedsReview(fields);
  const foundElsewhere = location?.source === "search" && reviewLocation;
  const locationKeys = ADDRESS_FIELDS.filter((key) => fields[key]);
  const guessed = fields.name?.detail === "guessed from your domain";
  const hasLegal = Boolean(fields.legalName && fields.street);
  const edit = (key: ProfileFieldKey) => (value: string) => read.edit(key, value);

  return (
    <div
      className="space-y-5 font-voice text-[1.1875rem] leading-[1.55]"
      data-testid="onboarding-meet"
    >
      {fields.summary ? (
        <Sentence testId="onboarding-summary">{fields.summary.value}</Sentence>
      ) : null}

      {guessed && !reading ? <Sentence>{t("guessed")}</Sentence> : null}

      {fields.name ? (
        <Sentence testId="onboarding-identity">
          {t("goOutAs")}
          <Chip
            field="name"
            label={tChips("businessName")}
            onCommit={edit("name")}
            value={fields.name.value}
          />
          {fields.email ? (
            <>
              {t("repliesTo")}
              <Chip
                field="email"
                label={tChips("contactEmail")}
                onCommit={edit("email")}
                value={fields.email.value}
              />
            </>
          ) : null}
          .
        </Sentence>
      ) : null}

      {profile.colors.length > 0 ? (
        <Sentence testId="onboarding-colors">
          {t("workingWith")}
          <span className="mx-1.5 inline-flex translate-y-[0.2em] items-center gap-2">
            {profile.colors.map((color) => (
              <button
                aria-label={tChips("colour", { hex: color.hex })}
                aria-pressed={profile.brandColor === color.hex}
                className="onboarding-dot"
                data-testid="onboarding-color"
                key={color.hex}
                onClick={() => read.pickColor(color.hex)}
                style={{ backgroundColor: color.hex }}
                type="button"
              />
            ))}
          </span>
          {t("palette")}
          {profile.colors.length > 1 ? t("pickOne") : t("thatsYourColour")}
        </Sentence>
      ) : null}

      {location ? (
        <Sentence testId="onboarding-location">
          {foundElsewhere
            ? t("saysIn", { source: location.detail ?? t("publicProfile") })
            : t("basedIn")}
          {fields.street && !hasLegal ? (
            <>
              <Chip
                field="street"
                label={tChips("street")}
                onCommit={edit("street")}
                value={fields.street.value}
              />
              ,{" "}
            </>
          ) : null}
          {fields.city ? (
            <Chip
              field="city"
              label={tChips("city")}
              onCommit={(next) => read.editAddress("city", next)}
              value={fields.city.value}
            />
          ) : null}
          {fields.region || reviewLocation ? (
            <>
              ,{" "}
              <Chip
                field="region"
                label={tChips("region")}
                onCommit={(next) => read.editAddress("region", next)}
                value={fields.region?.value ?? ""}
              />
            </>
          ) : null}
          {fields.postalCode || reviewLocation ? (
            <>
              {" "}
              <Chip
                field="postalCode"
                label={tChips("postalCode")}
                onCommit={(next) => read.editAddress("postalCode", next)}
                value={fields.postalCode?.value ?? ""}
              />
            </>
          ) : null}
          {(fields.city || fields.region || fields.postalCode) && (fields.country || reviewLocation)
            ? ", "
            : null}
          {fields.country || reviewLocation ? (
            <Chip
              field="country"
              label={tChips("country")}
              onCommit={(next) => read.editAddress("country", next)}
              value={fields.country?.value ?? ""}
            />
          ) : null}
          . {fields.region?.detail === "split from your city entry" ? <>{t("splitCity")}</> : null}
          {reviewLocation ? (
            <button
              className="onboarding-confirm"
              data-testid="onboarding-confirm-location"
              onClick={() => read.confirm(locationKeys)}
              type="button"
            >
              {t("confirmAddress")}
            </button>
          ) : null}
        </Sentence>
      ) : null}

      {hasLegal && fields.legalName?.source !== "registry" ? (
        <Sentence testId="onboarding-legal">
          {fields.legalName!.detail ? t("from", { detail: fields.legalName!.detail }) : ""}
          <Chip
            field="legalName"
            label={tChips("legalName")}
            onCommit={edit("legalName")}
            value={fields.legalName!.value}
          />
          ,{" "}
          <Chip
            field="street"
            label={tChips("street")}
            onCommit={edit("street")}
            value={fields.street!.value}
          />
          {fields.postalCode ? (
            <>
              ,{" "}
              <Chip
                field="postalCode"
                label={tChips("postcode")}
                onCommit={edit("postalCode")}
                value={fields.postalCode.value}
              />
            </>
          ) : null}
          .
        </Sentence>
      ) : null}

      {reading ? (
        <div className="space-y-2.5 pt-1">
          {steps.legal === "active" ? <Pending>{t("pending.legal")}</Pending> : null}
          {steps.colors === "active" ? <Pending>{t("pending.colors")}</Pending> : null}
          {steps.location === "active" ? <Pending>{t("pending.location")}</Pending> : null}
          {!steps.legal && !steps.colors ? <Pending>{t("pending.homepage")}</Pending> : null}
        </div>
      ) : (
        <VatStep key={profile.domain} profile={profile} read={read} />
      )}
    </div>
  );
}
