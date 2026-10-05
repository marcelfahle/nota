"use client";

import { Check, Loader2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ADDRESS_FIELDS, addressNeedsReview } from "@/lib/onboarding-address";
import type { ProfileFieldKey, SiteProfile } from "@/lib/site-reader/types";
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
      aria-label={`${label}: ${value || "not set"}. Change`}
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

const VAT_MESSAGES: Record<Exclude<VatReply, "valid-with-details">, string> = {
  invalid: "The registry doesn't know that number. Check it, or carry on and fix it later.",
  "tax-id": "Saved as your tax ID.",
  unavailable:
    "The registry isn't answering right now. We've kept the number and you can verify it later.",
  valid: "Valid. This registry keeps names and addresses to itself, so add yours here.",
};

function VatStep({ profile, read }: { profile: SiteProfile; read: SiteRead }) {
  const fields = profile.fields;
  const [value, setValue] = useState(fields.vatNumber?.value ?? "");
  const [pending, setPending] = useState(false);
  const [reply, setReply] = useState<VatReply | null>(null);
  const [error, setError] = useState<string | null>(null);
  const country = fields.countryCode?.value?.toUpperCase();
  const outsideEu = Boolean(country) && !EU.has(country!);
  const hasLegal = Boolean(fields.legalName && fields.street);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!value.trim() || pending) {
      return;
    }
    setPending(true);
    setError(null);
    const result = await read.checkVat(value);
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
            The EU VAT registry has you as{" "}
            <Chip
              field="legalName"
              label="Legal name"
              onCommit={(next) => read.edit("legalName", next)}
              value={fields.legalName?.value ?? ""}
            />
            {fields.street ? (
              <>
                {" "}
                at{" "}
                <Chip
                  field="street"
                  label="Street"
                  onCommit={(next) => read.edit("street", next)}
                  value={fields.street.value}
                />
              </>
            ) : null}
            .
          </>
        ) : hasLegal ? (
          <>
            {outsideEu ? "Your tax ID" : "Your VAT ID"}
            {fields.vatNumber
              ? " was on your site. Check it against the registry if you like."
              : " wasn’t on your site. Add it here if you have one."}
          </>
        ) : outsideEu ? (
          <>Your legal name and tax ID aren&rsquo;t on your site. Add your tax ID if you use one.</>
        ) : (
          <>
            Your legal name, address and VAT ID aren&rsquo;t public anywhere. Paste your VAT ID and,
            where the registry shares them, it fills in the rest.
          </>
        )}
      </p>

      <form className="flex flex-wrap items-center gap-2 font-sans" onSubmit={onSubmit}>
        <label className="sr-only" htmlFor="onboarding-vat-input">
          {outsideEu ? "Tax ID" : "VAT ID"}
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
          placeholder={outsideEu ? "Tax ID (optional)" : "ESB12345678"}
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
          {outsideEu ? "Save" : "Check"}
        </Button>
      </form>

      {reply === "valid-with-details" ? (
        <p className="flex items-start gap-2 font-sans text-sm" data-testid="onboarding-vat-result">
          <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          Valid. We used the registry details you hadn&rsquo;t already confirmed.
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
          {VAT_MESSAGES[reply]}
        </p>
      ) : null}
      {error ? <p className="font-sans text-sm text-destructive">{error}</p> : null}

      {reply === "valid" && !hasLegal ? (
        <p>
          Legal name{" "}
          <Chip
            field="legalName"
            label="Legal name"
            onCommit={(next) => read.edit("legalName", next)}
            placeholder="Your Company S.L."
            value={fields.legalName?.value ?? ""}
          />
          , registered at{" "}
          <Chip
            field="street"
            label="Street and number"
            onCommit={(next) => read.edit("street", next)}
            placeholder="Street and number"
            value={fields.street?.value ?? ""}
          />
          ,{" "}
          <Chip
            field="postalCode"
            label="Postcode"
            onCommit={(next) => read.edit("postalCode", next)}
            placeholder="Postcode"
            value={fields.postalCode?.value ?? ""}
          />{" "}
          <Chip
            field="city"
            label="City"
            onCommit={(next) => read.edit("city", next)}
            placeholder="City"
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

      {guessed && !reading ? (
        <Sentence>
          Your site didn&rsquo;t tell us much, so we started with a name from your address. Change
          anything that&rsquo;s off.
        </Sentence>
      ) : null}

      {fields.name ? (
        <Sentence testId="onboarding-identity">
          Your invoices go out as{" "}
          <Chip
            field="name"
            label="Business name"
            onCommit={edit("name")}
            value={fields.name.value}
          />
          {fields.email ? (
            <>
              , with replies to{" "}
              <Chip
                field="email"
                label="Contact email"
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
          Working with a{" "}
          <span className="mx-1.5 inline-flex translate-y-[0.2em] items-center gap-2">
            {profile.colors.map((color) => (
              <button
                aria-label={`Use ${color.hex} as your invoice colour`}
                aria-pressed={profile.brandColor === color.hex}
                className="onboarding-dot"
                data-testid="onboarding-color"
                key={color.hex}
                onClick={() => read.pickColor(color.hex)}
                style={{ backgroundColor: color.hex }}
                type="button"
              />
            ))}
          </span>{" "}
          palette.{" "}
          {profile.colors.length > 1
            ? "Pick the one that’s most you."
            : "That’s your invoice colour."}
        </Sentence>
      ) : null}

      {location ? (
        <Sentence testId="onboarding-location">
          {foundElsewhere
            ? `${location.detail ?? "A public profile"} says you’re in `
            : "You’re based in "}
          {fields.street && !hasLegal ? (
            <>
              <Chip
                field="street"
                label="Street"
                onCommit={edit("street")}
                value={fields.street.value}
              />
              ,{" "}
            </>
          ) : null}
          {fields.city ? (
            <Chip
              field="city"
              label="City"
              onCommit={(next) => read.editAddress("city", next)}
              value={fields.city.value}
            />
          ) : null}
          {fields.region || reviewLocation ? (
            <>
              ,{" "}
              <Chip
                field="region"
                label="State or region"
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
                label="Postal code"
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
              label="Country"
              onCommit={(next) => read.editAddress("country", next)}
              value={fields.country?.value ?? ""}
            />
          ) : null}
          .{" "}
          {fields.region?.detail === "split from your city entry" ? (
            <>We split your city and state so you can check each one. </>
          ) : null}
          {reviewLocation ? (
            <button
              className="onboarding-confirm"
              data-testid="onboarding-confirm-location"
              onClick={() => read.confirm(locationKeys)}
              type="button"
            >
              Check the full address, then confirm
            </button>
          ) : null}
        </Sentence>
      ) : null}

      {hasLegal && fields.legalName?.source !== "registry" ? (
        <Sentence testId="onboarding-legal">
          {fields.legalName!.detail ? `From ${fields.legalName!.detail}: ` : ""}
          <Chip
            field="legalName"
            label="Legal name"
            onCommit={edit("legalName")}
            value={fields.legalName!.value}
          />
          ,{" "}
          <Chip
            field="street"
            label="Street"
            onCommit={edit("street")}
            value={fields.street!.value}
          />
          {fields.postalCode ? (
            <>
              ,{" "}
              <Chip
                field="postalCode"
                label="Postcode"
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
          {steps.legal === "active" ? <Pending>Reading your footer and legal pages</Pending> : null}
          {steps.colors === "active" ? <Pending>Pulling out your logo and colours</Pending> : null}
          {steps.location === "active" ? (
            <Pending>Looking for where you&rsquo;re based</Pending>
          ) : null}
          {!steps.legal && !steps.colors ? <Pending>Opening your homepage</Pending> : null}
        </div>
      ) : (
        <VatStep key={profile.domain} profile={profile} read={read} />
      )}
    </div>
  );
}
