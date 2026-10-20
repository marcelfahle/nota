"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { taxIdentifierFromColumns, type TaxIdentifierType } from "@/lib/tax-identifier";

type ActionState = { error?: string; success?: boolean } | null;

type BankAccountOption = {
  id: string;
  isDefault: boolean;
  name: string;
};

type ClientFormProps = {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  bankAccounts?: Array<BankAccountOption>;
  defaultValues?: {
    address?: string | null;
    bankAccountId?: string | null;
    city?: string | null;
    company?: string | null;
    countryCode?: string | null;
    defaultBuyerReference?: string | null;
    defaultCurrency?: string | null;
    email?: string;
    name?: string;
    notes?: string | null;
    postalCode?: string | null;
    publicSector?: boolean;
    street?: string | null;
    taxIdentifierCountryCode?: string | null;
    taxIdentifierType?: TaxIdentifierType | null;
    taxIdentifierValue?: string | null;
    vatNumber?: string | null;
  };
  onCancel?: () => void;
  onSuccess?: () => void;
  redirectTo?: string;
  submitLabel?: string;
};

export function ClientForm({
  action,
  bankAccounts,
  defaultValues,
  onCancel,
  onSuccess,
  redirectTo,
  submitLabel,
}: ClientFormProps) {
  const t = useTranslations("clients.form");
  const [state, formAction, pending] = useActionState(action, null);
  const router = useRouter();
  const identifier = taxIdentifierFromColumns(defaultValues ?? {});
  const [identifierType, setIdentifierType] = useState<TaxIdentifierType>(
    identifier?.type ?? "tax_id",
  );
  const [publicSector, setPublicSector] = useState(Boolean(defaultValues?.publicSector));
  const hasStructuredAddress = Boolean(
    defaultValues?.street || defaultValues?.postalCode || defaultValues?.city,
  );

  useEffect(() => {
    if (state?.success) {
      if (redirectTo) {
        router.push(redirectTo);
      }
      onSuccess?.();
    }
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form action={formAction} className="space-y-4" data-testid="client-form">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">{t("name")}</Label>
          <Input
            data-testid="client-name"
            defaultValue={defaultValues?.name ?? ""}
            id="name"
            name="name"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">{t("email")}</Label>
          <Input
            data-testid="client-email"
            defaultValue={defaultValues?.email ?? ""}
            id="email"
            name="email"
            required
            type="email"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="company">{t("company")}</Label>
          <Input
            data-testid="client-company"
            defaultValue={defaultValues?.company ?? ""}
            id="company"
            name="company"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="taxIdentifierType">{t("taxIdType")}</Label>
          <Select
            name="taxIdentifierType"
            onValueChange={(value) => setIdentifierType(value as TaxIdentifierType)}
            value={identifierType}
          >
            <SelectTrigger className="w-full" id="taxIdentifierType">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="eu_vat">{t("euVat")}</SelectItem>
              <SelectItem value="us_ein">{t("usEin")}</SelectItem>
              <SelectItem value="tax_id">{t("taxId")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 sm:col-start-2">
          <Label htmlFor="taxIdentifierValue">
            {identifierType === "eu_vat"
              ? t("vatId")
              : identifierType === "us_ein"
                ? t("ein")
                : t("taxId")}
          </Label>
          <Input
            defaultValue={identifier?.value ?? ""}
            id="taxIdentifierValue"
            name="taxIdentifierValue"
            placeholder={identifierType === "us_ein" ? "12-3456789" : undefined}
          />
        </div>
      </div>

      {/* Address: structured so invoices and XRechnung can name street, city and country. */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">{t("address")}</legend>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground" htmlFor="street">
            {t("street")}
          </Label>
          <Input
            data-testid="client-street"
            defaultValue={defaultValues?.street ?? ""}
            id="street"
            name="street"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)_6rem]">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground" htmlFor="postalCode">
              {t("postalCode")}
            </Label>
            <Input
              data-testid="client-postal-code"
              defaultValue={defaultValues?.postalCode ?? ""}
              id="postalCode"
              name="postalCode"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground" htmlFor="city">
              {t("city")}
            </Label>
            <Input
              data-testid="client-city"
              defaultValue={defaultValues?.city ?? ""}
              id="city"
              name="city"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground" htmlFor="countryCode">
              {t("country")}
            </Label>
            <Input
              className="uppercase"
              data-testid="client-country-code"
              defaultValue={defaultValues?.countryCode ?? ""}
              id="countryCode"
              maxLength={2}
              name="countryCode"
              placeholder="DE"
            />
          </div>
        </div>
        <input name="address" type="hidden" value={defaultValues?.address ?? ""} />
        {!hasStructuredAddress && defaultValues?.address ? (
          <p className="text-xs whitespace-pre-line text-muted-foreground">
            {t("onFile", { address: defaultValues.address })}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">{t("countryHint")}</p>
        )}
      </fieldset>

      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            checked={publicSector}
            className="size-4 rounded border-zinc-300"
            data-testid="client-public-sector"
            name="publicSector"
            onChange={(event) => setPublicSector(event.target.checked)}
            type="checkbox"
            value="true"
          />
          {t("publicSector")}
        </label>
        <div className="space-y-2">
          <Label htmlFor="defaultBuyerReference">
            {publicSector ? t("leitwegId") : t("buyerReference")}
          </Label>
          <Input
            data-testid="client-buyer-reference"
            defaultValue={defaultValues?.defaultBuyerReference ?? ""}
            id="defaultBuyerReference"
            name="defaultBuyerReference"
            placeholder={publicSector ? "04011000-1234512345-35" : t("referencePlaceholder")}
          />
          <p className="text-xs text-muted-foreground">{t("referenceHint")}</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">{t("notes")}</Label>
        <textarea
          className="w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
          defaultValue={defaultValues?.notes ?? ""}
          id="notes"
          name="notes"
          rows={2}
        />
      </div>

      <div className="space-y-2">
        <Label>{t("currency")}</Label>
        <Select defaultValue={defaultValues?.defaultCurrency ?? "EUR"} name="defaultCurrency">
          <SelectTrigger className="w-full" data-testid="client-currency-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="EUR">EUR</SelectItem>
            <SelectItem value="USD">USD</SelectItem>
            <SelectItem value="GBP">GBP</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {bankAccounts && bankAccounts.length >= 2 && (
        <div className="space-y-2">
          <Label>{t("bankAccount")}</Label>
          <Select defaultValue={defaultValues?.bankAccountId ?? ""} name="bankAccountId">
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("useDefault")} />
            </SelectTrigger>
            <SelectContent>
              {bankAccounts.map((ba) => (
                <SelectItem key={ba.id} value={ba.id}>
                  {ba.name}
                  {ba.isDefault ? ` ${t("default")}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {state?.error && <p className="text-sm text-red-500">{state.error}</p>}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button onClick={onCancel} type="button" variant="outline">
            {t("cancel")}
          </Button>
        )}
        <Button disabled={pending} type="submit">
          {pending ? t("saving") : (submitLabel ?? t("saveClient"))}
        </Button>
      </div>
    </form>
  );
}
