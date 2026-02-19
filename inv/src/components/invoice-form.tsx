"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
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
import { formatCurrency } from "@/lib/utils";

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
  defaultCurrency: string | null;
  email: string;
  id: string;
  name: string;
};

type InvoiceFormProps = {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  clients: Array<Client>;
  defaultValues?: {
    clientId?: string;
    currency?: string;
    dueAt?: string;
    internalNotes?: string | null;
    issuedAt?: string;
    lineItems?: Array<{ description: string; quantity: string; unitPrice: string }>;
    notes?: string | null;
    reverseCharge?: string;
    taxRate?: string;
  };
  redirectTo?: string;
  submitLabel?: string;
};

function emptyLineItem(): LineItem {
  return { description: "", quantity: "1", unitPrice: "" };
}

function toNumber(val: string): number {
  const n = Number.parseFloat(val);
  return Number.isNaN(n) ? 0 : n;
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
  redirectTo = "/invoices",
  submitLabel = "Save Draft",
}: InvoiceFormProps) {
  const [state, formAction, pending] = useActionState(action, null);
  const router = useRouter();

  const [items, setItems] = useState<Array<LineItem>>(
    defaultValues?.lineItems?.length ? defaultValues.lineItems : [emptyLineItem()],
  );

  const [currency, setCurrency] = useState(defaultValues?.currency ?? "EUR");

  const [taxRate, setTaxRate] = useState(defaultValues?.taxRate ?? "0");

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

  // Computed totals
  const lineAmounts = items.map((item) => toNumber(item.quantity) * toNumber(item.unitPrice));
  const subtotal = lineAmounts.reduce((sum, a) => sum + a, 0);
  const taxRateNum = toNumber(taxRate);
  const taxAmount = subtotal * (taxRateNum / 100);
  const total = subtotal + taxAmount;

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
        formData.set("currency", currency);
        formAction(formData);
      }}
      className="space-y-8"
    >
      {/* Invoice Details */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="clientId">Client *</Label>
          <Select defaultValue={defaultValues?.clientId} name="clientId" required>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a client" />
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
          <Label>Currency</Label>
          <Select name="currency_display" onValueChange={setCurrency} value={currency}>
            <SelectTrigger className="w-full">
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
          <Label htmlFor="issuedAt">Issue Date *</Label>
          <Input
            defaultValue={defaultValues?.issuedAt ?? todayISO()}
            id="issuedAt"
            name="issuedAt"
            required
            type="date"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dueAt">Due Date *</Label>
          <Input
            defaultValue={defaultValues?.dueAt ?? defaultDueDate()}
            id="dueAt"
            name="dueAt"
            required
            type="date"
          />
        </div>
      </div>

      {/* Line Items */}
      <div>
        <Label className="mb-3 block">Line Items</Label>
        <div className="rounded-lg border border-zinc-200">
          {/* Header */}
          <div className="grid grid-cols-[1fr_80px_100px_100px_36px] gap-2 border-b border-zinc-100 px-3 py-2 text-xs font-medium tracking-wide text-zinc-400 uppercase">
            <span>Description</span>
            <span>Qty/Hrs</span>
            <span>Rate</span>
            <span className="text-right">Amount</span>
            <span />
          </div>

          {/* Rows */}
          {items.map((item, index) => (
            <div
              className="grid grid-cols-[1fr_80px_100px_100px_36px] items-center gap-2 border-b border-zinc-50 px-3 py-2"
              key={index}
            >
              <Input
                className="h-8 text-sm"
                onChange={(e) => updateItem(index, "description", e.target.value)}
                placeholder="Description"
                required
                value={item.description}
              />
              <Input
                className="h-8 text-sm"
                min="0"
                onChange={(e) => updateItem(index, "quantity", e.target.value)}
                placeholder="1"
                required
                step="0.01"
                type="number"
                value={item.quantity}
              />
              <Input
                className="h-8 text-sm"
                min="0"
                onChange={(e) => updateItem(index, "unitPrice", e.target.value)}
                placeholder="0.00"
                required
                step="0.01"
                type="number"
                value={item.unitPrice}
              />
              <p className="text-right text-sm font-medium text-zinc-900">
                {formatCurrency(lineAmounts[index], currency)}
              </p>
              <button
                className="flex h-8 w-8 items-center justify-center rounded text-zinc-400 transition-colors hover:text-red-500"
                disabled={items.length <= 1}
                onClick={() => removeItem(index)}
                type="button"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}

          {/* Add Line Item */}
          <div className="px-3 py-2">
            <button
              className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"
              onClick={addItem}
              type="button"
            >
              <Plus className="size-3.5" />
              Add line item
            </button>
          </div>
        </div>
      </div>

      {/* Totals */}
      <div className="flex justify-end">
        <div className="w-64 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-500">Subtotal</span>
            <span className="font-medium">{formatCurrency(subtotal, currency)}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-zinc-500">Tax</span>
            <Input
              className="h-7 w-16 text-center text-xs"
              max="100"
              min="0"
              onChange={(e) => setTaxRate(e.target.value)}
              step="0.01"
              type="number"
              value={taxRate}
            />
            <span className="text-zinc-500">%</span>
            <span className="ml-auto font-medium">{formatCurrency(taxAmount, currency)}</span>
          </div>
          <div className="flex items-center justify-between border-t border-zinc-200 pt-2 text-sm">
            <span className="font-semibold">Total</span>
            <span className="text-lg font-semibold">{formatCurrency(total, currency)}</span>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="notes">Notes (visible on invoice)</Label>
          <textarea
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
            defaultValue={defaultValues?.notes ?? ""}
            id="notes"
            name="notes"
            placeholder="Payment terms, thank you message, etc."
            rows={3}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="internalNotes">Internal Notes</Label>
          <textarea
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
            defaultValue={defaultValues?.internalNotes ?? ""}
            id="internalNotes"
            name="internalNotes"
            placeholder="Notes for your own reference"
            rows={3}
          />
        </div>
      </div>

      {/* Reverse Charge */}
      <div className="flex items-center gap-2">
        <input
          className="size-4 rounded border-zinc-300"
          defaultChecked={defaultValues?.reverseCharge === "true"}
          id="reverseCharge"
          name="reverseCharge"
          type="checkbox"
          value="true"
        />
        <Label className="text-sm font-normal" htmlFor="reverseCharge">
          Reverse charge (VAT not applicable)
        </Label>
      </div>

      {state?.error && <p className="text-sm text-red-500">{state.error}</p>}

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button onClick={() => router.push("/invoices")} type="button" variant="outline">
          Cancel
        </Button>
        <Button disabled={pending} type="submit">
          {pending ? "Saving..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}
