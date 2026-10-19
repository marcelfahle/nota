"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { useActionState, useEffect, useState, useCallback } from "react";

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
import { addDecimals, currencyExponent, multiplyAndRound, percentageAndRound } from "@/lib/money";
import { defaultServicePeriod } from "@/lib/service-period";
import { requiresZeroRate, TAX_TREATMENTS, type TaxTreatment } from "@/lib/tax-treatment";
import { formatCurrency, type Locale } from "@/lib/utils";

type LineItem = {
  description: string;
  quantity: string;
  unitPrice: string;
};

type ActionState = {
  error?: string;
  invoiceId?: string;
  success?: boolean;
} | null;

type Client = {
  defaultBuyerReference?: string | null;
  defaultCurrency: string | null;
  email: string;
  id: string;
  name: string;
  publicSector?: boolean;
};

type InvoiceFormProps = {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  clients: Array<Client>;
  defaultValues?: {
    buyerReference?: string | null;
    clientId?: string;
    currency?: string;
    dueAt?: string;
    internalNotes?: string | null;
    issuedAt?: string;
    lineItems?: Array<{ description: string; quantity: string; unitPrice: string }>;
    notes?: string | null;
    servicePeriodEnd?: string | null;
    servicePeriodStart?: string | null;
    taxRate?: string;
    taxTreatment?: TaxTreatment;
  };
  locale?: Locale;
  org: { countryCode: string | null; defaultTaxTreatment: TaxTreatment };
  redirectTo?: string;
  submitLabel?: string;
};

function emptyLineItem(): LineItem {
  return { description: "", quantity: "1", unitPrice: "" };
}

function previewDecimal(value: string) {
  return /^\d+(?:\.\d*)?$/.test(value) ? value : "0";
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function defaultDueDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().split("T")[0];
}

export function InvoiceForm({
  action,
  clients,
  defaultValues,
  locale = "en-US",
  org,
  redirectTo = "/invoices",
  submitLabel,
}: InvoiceFormProps) {
  const t = useTranslations("invoiceForm");
  const tTreatment = useTranslations("taxTreatment");
  const [state, formAction, pending] = useActionState(action, null);
  const router = useRouter();

  const [items, setItems] = useState<Array<LineItem>>(
    defaultValues?.lineItems?.length ? defaultValues.lineItems : [emptyLineItem()],
  );
  const [clientId, setClientId] = useState(defaultValues?.clientId ?? "");
  const [currency, setCurrency] = useState(defaultValues?.currency ?? "EUR");
  const [issuedAt, setIssuedAt] = useState(defaultValues?.issuedAt ?? todayISO());
  const [taxTreatment, setTaxTreatment] = useState<TaxTreatment>(
    defaultValues?.taxTreatment ?? org.defaultTaxTreatment,
  );
  const [taxRate, setTaxRate] = useState(defaultValues?.taxRate ?? "0");
  // Until someone edits the period it follows the line items and the issue date,
  // shown as a visible default so nobody has to guess what gets saved.
  const [editedPeriod, setEditedPeriod] = useState<{ end: string; start: string } | null>(
    defaultValues?.servicePeriodStart
      ? {
          end: defaultValues.servicePeriodEnd ?? defaultValues.servicePeriodStart,
          start: defaultValues.servicePeriodStart,
        }
      : null,
  );
  // A public-sector client brings its Leitweg-ID along until the reference is edited.
  const [editedReference, setEditedReference] = useState<string | null>(
    defaultValues?.buyerReference ?? null,
  );

  const selectedClient = clients.find((client) => client.id === clientId);
  const zeroRated = requiresZeroRate(taxTreatment);
  const german = org.countryCode === "DE";
  const period = editedPeriod ?? defaultServicePeriod(items, issuedAt) ?? { end: "", start: "" };
  const servicePeriodStart = period.start;
  const servicePeriodEnd = period.end;
  const buyerReference = editedReference ?? selectedClient?.defaultBuyerReference ?? "";

  useEffect(() => {
    if (state?.success && state.invoiceId) {
      router.push(redirectTo);
    }
  }, [state, router, redirectTo]);

  const updateItem = useCallback((index: number, field: keyof LineItem, value: string) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  }, []);

  const addItem = useCallback(() => {
    setItems((prev) => [...prev, emptyLineItem()]);
  }, []);

  const removeItem = useCallback((index: number) => {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }, []);

  function changeTreatment(value: TaxTreatment) {
    setTaxTreatment(value);
    if (requiresZeroRate(value)) {
      setTaxRate("0");
    }
  }

  // Computed totals
  const exponent = currencyExponent(currency);
  const lineAmountDecimals = items.map((item) =>
    multiplyAndRound(previewDecimal(item.quantity), previewDecimal(item.unitPrice), exponent),
  );
  const subtotalDecimal = addDecimals(lineAmountDecimals, exponent);
  const taxAmountDecimal = percentageAndRound(subtotalDecimal, previewDecimal(taxRate), exponent);
  const totalDecimal = addDecimals([subtotalDecimal, taxAmountDecimal], exponent);
  const lineAmounts = lineAmountDecimals.map(Number);
  const subtotal = Number(subtotalDecimal);
  const taxAmount = Number(taxAmountDecimal);
  const total = Number(totalDecimal);

  return (
    <form
      action={(formData) => {
        // Inject line items as JSON and taxRate
        formData.set(
          "lineItems",
          JSON.stringify(
            items.map((item) => ({
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
            })),
          ),
        );
        formData.set("taxRate", taxRate);
        formData.set("taxTreatment", taxTreatment);
        formData.set("currency", currency);
        posthog.capture("invoice_submitted", {
          currency,
          invoice_mode: defaultValues ? "edit" : "create",
          line_item_count: items.length,
          tax_treatment: taxTreatment,
          total,
        });
        formAction(formData);
      }}
      className="space-y-8"
      data-testid="invoice-form"
    >
      {/* Invoice Details */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="clientId">{t("client")}</Label>
          <Select name="clientId" onValueChange={setClientId} required value={clientId}>
            <SelectTrigger className="w-full" data-testid="invoice-client-select">
              <SelectValue placeholder={t("selectClient")} />
            </SelectTrigger>
            <SelectContent>
              {clients.map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  {client.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>{t("currency")}</Label>
          <Select name="currency_display" onValueChange={setCurrency} value={currency}>
            <SelectTrigger className="w-full" data-testid="invoice-currency-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="EUR">EUR</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
              <SelectItem value="GBP">GBP</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="issuedAt">{t("issueDate")}</Label>
          <Input
            id="issuedAt"
            name="issuedAt"
            onChange={(e) => setIssuedAt(e.target.value)}
            required
            type="date"
            value={issuedAt}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dueAt">{t("dueDate")}</Label>
          <Input
            defaultValue={defaultValues?.dueAt ?? defaultDueDate()}
            id="dueAt"
            name="dueAt"
            required
            type="date"
          />
        </div>
      </div>

      {/* Service period and buyer reference */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="servicePeriodStart">
            {t("servicePeriod")}
            {german ? " *" : ""}
          </Label>
          <div className="flex items-center gap-2">
            <Input
              data-testid="invoice-service-period-start"
              id="servicePeriodStart"
              name="servicePeriodStart"
              onChange={(e) => setEditedPeriod({ end: servicePeriodEnd, start: e.target.value })}
              required={german}
              type="date"
              value={servicePeriodStart}
            />
            <span className="text-sm text-zinc-500">{t("to")}</span>
            <Input
              aria-label={t("servicePeriodEnd")}
              data-testid="invoice-service-period-end"
              name="servicePeriodEnd"
              onChange={(e) => setEditedPeriod({ end: e.target.value, start: servicePeriodStart })}
              required={german}
              type="date"
              value={servicePeriodEnd}
            />
          </div>
          <p className="text-xs text-zinc-500">{t("servicePeriodHint")}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="buyerReference">
            {t("buyerReference")}
            {selectedClient?.publicSector ? " *" : ""}
          </Label>
          <Input
            data-testid="invoice-buyer-reference"
            id="buyerReference"
            name="buyerReference"
            onChange={(e) => setEditedReference(e.target.value)}
            placeholder={selectedClient?.publicSector ? t("leitwegId") : t("optional")}
            required={Boolean(selectedClient?.publicSector)}
            value={buyerReference}
          />
          <p className="text-xs text-zinc-500">
            {selectedClient?.publicSector ? t("publicSectorHint") : t("referenceHint")}
          </p>
        </div>
      </div>

      {/* Line Items */}
      <div>
        <Label className="mb-3 block">{t("lineItems")}</Label>
        <div className="rounded-lg border border-zinc-200">
          {/* Header (desktop only) */}
          <div className="hidden gap-2 border-b border-zinc-100 px-3 py-2 text-xs font-medium tracking-wide text-zinc-400 uppercase sm:grid sm:grid-cols-[1fr_80px_100px_100px_36px]">
            <span>{t("description")}</span>
            <span>{t("qtyHours")}</span>
            <span>{t("rate")}</span>
            <span className="text-right">{t("amount")}</span>
            <span />
          </div>

          {/* Rows */}
          {items.map((item, index) => (
            <div
              className="flex flex-col gap-2 border-b border-zinc-50 px-3 py-3 sm:grid sm:grid-cols-[1fr_80px_100px_100px_36px] sm:items-center sm:py-2"
              key={index}
            >
              <Input
                className="h-8 text-sm"
                data-testid={`invoice-line-item-description-${index}`}
                onChange={(e) => updateItem(index, "description", e.target.value)}
                placeholder={t("description")}
                required
                value={item.description}
              />
              <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 sm:contents">
                <Input
                  className="h-8 text-sm"
                  data-testid={`invoice-line-item-quantity-${index}`}
                  min="0"
                  onChange={(e) => updateItem(index, "quantity", e.target.value)}
                  placeholder={t("qty")}
                  required
                  step="0.000001"
                  type="number"
                  value={item.quantity}
                />
                <Input
                  className="h-8 text-sm"
                  data-testid={`invoice-line-item-unit-price-${index}`}
                  min="0"
                  onChange={(e) => updateItem(index, "unitPrice", e.target.value)}
                  placeholder={t("rate")}
                  required
                  step="0.000001"
                  type="number"
                  value={item.unitPrice}
                />
                <button
                  className="flex h-8 w-8 items-center justify-center rounded text-zinc-400 transition-colors hover:text-red-500 sm:order-last"
                  disabled={items.length <= 1}
                  onClick={() => removeItem(index)}
                  type="button"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              <p className="text-right text-sm font-medium text-zinc-900 sm:order-none">
                {formatCurrency(lineAmounts[index], currency, locale)}
              </p>
            </div>
          ))}

          {/* Add Line Item */}
          <div className="px-3 py-2">
            <button
              className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"
              data-testid="invoice-add-line-item"
              onClick={addItem}
              type="button"
            >
              <Plus className="size-3.5" />
              {t("addLineItem")}
            </button>
          </div>
        </div>
      </div>

      {/* Tax treatment and totals */}
      <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="space-y-2">
          <Label htmlFor="taxTreatment">{t("vatTreatment")}</Label>
          <Select
            onValueChange={(value) => changeTreatment(value as TaxTreatment)}
            value={taxTreatment}
          >
            <SelectTrigger className="w-full" data-testid="invoice-tax-treatment" id="taxTreatment">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TAX_TREATMENTS.map((treatment) => (
                <SelectItem key={treatment} value={treatment}>
                  {tTreatment(`labels.${treatment}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-zinc-500">{tTreatment(`hints.${taxTreatment}`)}</p>
          <p className="text-xs text-zinc-500">{t("oneRate")}</p>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-500">{t("subtotal")}</span>
            <span className="font-medium">{formatCurrency(subtotal, currency, locale)}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-zinc-500">{t("vat")}</span>
            <Input
              aria-label={t("taxRate")}
              className="h-7 w-20 text-center text-xs"
              data-testid="invoice-tax-rate"
              disabled={zeroRated}
              max="100"
              min="0"
              onChange={(e) => setTaxRate(e.target.value)}
              step="0.000001"
              type="number"
              value={taxRate}
            />
            <span className="text-zinc-500">%</span>
            <span className="ml-auto font-medium">
              {formatCurrency(taxAmount, currency, locale)}
            </span>
          </div>
          <div className="flex items-center justify-between border-t border-zinc-200 pt-2 text-sm">
            <span className="font-semibold">{t("total")}</span>
            <span className="text-lg font-semibold">{formatCurrency(total, currency, locale)}</span>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="notes">{t("notes")}</Label>
          <textarea
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
            defaultValue={defaultValues?.notes ?? ""}
            id="notes"
            name="notes"
            placeholder={t("notesPlaceholder")}
            rows={3}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="internalNotes">{t("internalNotes")}</Label>
          <textarea
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
            defaultValue={defaultValues?.internalNotes ?? ""}
            id="internalNotes"
            name="internalNotes"
            placeholder={t("internalNotesPlaceholder")}
            rows={3}
          />
        </div>
      </div>

      {state?.error && (
        <p className="text-sm text-red-500" role="alert">
          {state.error}
        </p>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button onClick={() => router.push("/invoices")} type="button" variant="outline">
          {t("cancel")}
        </Button>
        <Button data-testid="invoice-submit" disabled={pending} type="submit">
          {pending ? t("saving") : (submitLabel ?? t("saveDraft"))}
        </Button>
      </div>
    </form>
  );
}
