import { ArrowRight } from "lucide-react";

import type { SiteProfile } from "@/lib/site-reader/types";
import { formatTaxIdentifier, taxIdentifierFromLegacyVatNumber } from "@/lib/tax-identifier";
import { cn, formatCurrency } from "@/lib/utils";

const INK = "#1F1B16";

function formatDate(date: Date) {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** A value that has landed, or a highlighter block naming what is still missing. */
function Slot({
  className,
  missing,
  value,
}: {
  className?: string;
  missing: string;
  value: string | null | undefined;
}) {
  return value ? (
    <span className={cn("onboarding-land", className)} key={value}>
      {value}
    </span>
  ) : (
    <span className={cn("onboarding-missing", className)}>{missing}</span>
  );
}

/**
 * The invoice the visitor is about to own, drawn from whatever has been read
 * so far. It mirrors the public invoice page so the preview keeps its promise.
 */
export function InvoicePreview({
  brief = false,
  className,
  compact = false,
  details = !compact,
  icon,
  profile,
  reading,
  testId = "onboarding-invoice",
}: {
  /** Header, total and pay bar only: the phone-sized invoice. */
  brief?: boolean;
  className?: string;
  compact?: boolean;
  /** Address and VAT lines under the name. On by default at full size. */
  details?: boolean;
  /** A favicon loaded in the browser while the address is still being typed. */
  icon?: string | null;
  profile: SiteProfile | null;
  reading: boolean;
  testId?: string;
}) {
  const fields = profile?.fields ?? {};
  const taxIdentifier =
    profile?.taxIdentifier ?? taxIdentifierFromLegacyVatNumber(fields.vatNumber?.value);
  const name = fields.name?.value;
  const color = profile?.brandColor ?? null;
  const textOnColor =
    profile?.colors.find((candidate) => candidate.hex === color)?.text ?? (color ? "#FFFFFF" : INK);
  const cityLine = [fields.postalCode?.value, fields.city?.value].filter(Boolean).join(" ");
  const regionLine = fields.region?.value;
  const today = new Date();
  const due = new Date(today.getTime() + 14 * 86_400_000);
  const amount = formatCurrency(1200, "EUR");

  return (
    <article
      aria-label="Your invoice preview"
      className={cn(
        "invoice-paper border border-black/10 text-[#1f1b16]",
        compact ? "p-5 text-[11px]" : "p-6 sm:p-9",
        className,
      )}
      data-testid={testId}
    >
      <header
        className={cn(
          "flex items-start justify-between gap-4 border-b border-black/10",
          brief ? "pb-4" : "pb-6",
        )}
      >
        <div className="flex min-w-0 items-start gap-3">
          {profile?.logo ? (
            <img
              alt=""
              className={cn(
                "onboarding-pop w-auto shrink-0 rounded-md object-contain object-left",
                compact ? "h-8 max-w-[5rem]" : "h-11 max-w-[7.5rem]",
              )}
              data-testid={`${testId}-logo`}
              src={profile.logo}
            />
          ) : icon ? (
            <img
              alt=""
              className="onboarding-pop size-11 shrink-0 rounded-md object-contain"
              key={icon}
              referrerPolicy="no-referrer"
              src={icon}
            />
          ) : (
            <span
              aria-hidden="true"
              className={cn(
                "grid size-11 shrink-0 place-items-center rounded-md text-base font-bold transition-colors duration-500",
                !name && reading && "onboarding-pulse",
              )}
              style={{
                backgroundColor: color ?? "var(--paper-2)",
                color: color ? textOnColor : INK,
              }}
            >
              {name ? name.slice(0, 1).toUpperCase() : ""}
            </span>
          )}
          <div className="min-w-0 space-y-0.5 text-xs leading-5 text-[#6b655c]">
            <p className="truncate text-sm font-bold text-[#1f1b16]">
              <Slot missing="Your business" value={fields.legalName?.value ?? name} />
            </p>
            {details ? (
              <>
                <p>
                  <Slot missing="Street and number" value={fields.street?.value} />
                </p>
                <p>
                  <Slot missing="Postcode, city" value={cityLine || null} />
                  {fields.country?.value ? (
                    <span className="onboarding-land" key={fields.country.value}>
                      {cityLine || regionLine ? ", " : " "}
                      {regionLine ? `${regionLine}, ` : ""}
                      {fields.country.value}
                    </span>
                  ) : regionLine ? (
                    <span className="onboarding-land">
                      {cityLine ? ", " : " "}
                      {regionLine}
                    </span>
                  ) : null}
                </p>
                <p>
                  <Slot missing="Tax ID" value={formatTaxIdentifier(taxIdentifier)} />
                </p>
              </>
            ) : null}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p
            className={cn(
              "font-bold tracking-[-0.04em]",
              compact ? "text-2xl" : "text-3xl sm:text-4xl",
            )}
          >
            Invoice
          </p>
          <p className="mt-1 font-mono text-xs text-[#6b655c]">INV-0001</p>
        </div>
      </header>

      {brief ? null : (
        <>
          <section className="grid grid-cols-3 gap-4 border-b border-black/10 py-6">
            <div>
              <p className="nota-label text-[#6b655c]">Billed to</p>
              <p className="mt-2 text-sm font-bold">Your first client</p>
            </div>
            <div>
              <p className="nota-label text-[#6b655c]">Issued</p>
              <p className="mt-2 font-mono text-xs">{formatDate(today)}</p>
            </div>
            <div>
              <p className="nota-label text-[#6b655c]">Due</p>
              <p className="mt-2 font-mono text-xs">{formatDate(due)}</p>
            </div>
          </section>

          <table className="mt-6 w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-black/10 text-[#6b655c]">
                <th className="nota-label pb-3 font-medium">Description</th>
                <th className="nota-label w-12 pb-3 text-right font-medium">Qty</th>
                <th className="nota-label w-24 pb-3 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-black/10 align-top">
                <td className="py-4 pr-3 font-medium">Your first project</td>
                <td className="py-4 text-right font-mono text-xs">1</td>
                <td className="py-4 text-right font-mono text-xs font-medium">{amount}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      <div className={cn("flex items-end justify-between gap-5", brief ? "mt-4" : "mt-6")}>
        <p className="nota-label pb-1">Total due</p>
        <p
          className={cn("font-mono font-bold tracking-[-0.04em]", compact ? "text-xl" : "text-3xl")}
        >
          {amount}
        </p>
      </div>

      <div
        className={cn(
          "flex min-h-11 items-center justify-between gap-4 px-4 text-sm font-bold transition-colors duration-500",
          brief ? "mt-4" : "mt-6",
        )}
        data-testid={`${testId}-pay`}
        style={{ backgroundColor: color ?? "var(--paper-2)", color: color ? textOnColor : INK }}
      >
        <span>Pay {amount}</span>
        <span className="flex items-center gap-2 font-mono text-xs">
          Secure payment <ArrowRight className="size-4" />
        </span>
      </div>

      {compact ? null : (
        <footer className="mt-7 flex items-center justify-between gap-4 border-t border-black/10 pt-4 font-mono text-xs text-[#6b655c]">
          <Slot missing="you@yourbusiness.com" value={fields.email?.value} />
          <span>{profile?.domain}</span>
        </footer>
      )}
    </article>
  );
}
