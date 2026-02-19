"use client";

import { useActionState, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
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
  success?: boolean;
  invoiceId?: string;
} | null;

type Client = {
  id: string;
  name: string;
  email: string;
  defaultCurrency: string | null;
};

type InvoiceFormProps = {
  clients: Client[];
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  defaultValues?: {
    clientId?: string;
    currency?: string;
    issuedAt?: string;
    dueAt?: string;
    taxRate?: string;
    notes?: string | null;
    internalNotes?: string | null;
    reverseCharge?: string;
    lineItems?: { description: string; quantity: string; unitPrice: string }[];
  };
  submitLabel?: string;
};

function emptyLineItem(): LineItem {
  return { description: "", quantity: "1", unitPrice: "" };
}

function toNumber(val: string): number {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
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
  clients,
  action,
  defaultValues,
  submitLabel = "Save Draft",
}: InvoiceFormProps) {
  const [state, formAction, pending] = useActionState(action, null);
  const router = useRouter();

  const [items, setItems] = useState<LineItem[]>(
    defaultValues?.lineItems?.length
      ? defaultValues.lineItems
      : [emptyLineItem()],
  );

  const [currency, setCurrency] = useState(
    defaultValues?.currency ?? "EUR",
  );

  const [taxRate, setTaxRate] = useState(defaultValues?.taxRate ?? "0");

  useEffect(() => {
    if (state?.success && state.invoiceId) {
      router.push(`/invoices`);
    }
  }, [state, router]);

  const updateItem = useCallback(
    (index: number, field: keyof LineItem, value: string) => {
      setItems((prev) =>
        prev.map((item, i) =>
          i === index ? { ...item, [field]: value } : item,
        ),
      );
    },
    [],
  );

  const addItem = useCallback(() => {
    setItems((prev) => [...prev, emptyLineItem()]);
  }, []);

  const removeItem = useCallback((index: number) => {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }, []);

  // Computed totals
  const lineAmounts = items.map(
    (item) => toNumber(item.quantity) * toNumber(item.unitPrice),
  );
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
          <Select
            name="clientId"
            defaultValue={defaultValues?.clientId}
            required
          >
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
          <Select
            name="currency_display"
            value={currency}
            onValueChange={setCurrency}
          >
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
            id="issuedAt"
            name="issuedAt"
            type="date"
            defaultValue={defaultValues?.issuedAt ?? todayISO()}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dueAt">Due Date *</Label>
          <Input
            id="dueAt"
            name="dueAt"
            type="date"
            defaultValue={defaultValues?.dueAt ?? defaultDueDate()}
            required
          />
        </div>
      </div>

      {/* Line Items */}
      <div>
        <Label className="mb-3 block">Line Items</Label>
        <div className="rounded-lg border border-zinc-200">
          {/* Header */}
          <div className="grid grid-cols-[1fr_80px_100px_100px_36px] gap-2 border-b border-zinc-100 px-3 py-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
            <span>Description</span>
            <span>Qty/Hrs</span>
            <span>Rate</span>
            <span className="text-right">Amount</span>
            <span />
          </div>

          {/* Rows */}
          {items.map((item, index) => (
            <div
              key={index}
              className="grid grid-cols-[1fr_80px_100px_100px_36px] items-center gap-2 border-b border-zinc-50 px-3 py-2"
            >
              <Input
                placeholder="Description"
                value={item.description}
                onChange={(e) =>
                  updateItem(index, "description", e.target.value)
                }
                className="h-8 text-sm"
                required
              />
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="1"
                value={item.quantity}
                onChange={(e) =>
                  updateItem(index, "quantity", e.target.value)
                }
                className="h-8 text-sm"
                required
              />
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={item.unitPrice}
                onChange={(e) =>
                  updateItem(index, "unitPrice", e.target.value)
                }
                className="h-8 text-sm"
                required
              />
              <p className="text-right text-sm font-medium text-zinc-900">
                {formatCurrency(lineAmounts[index], currency)}
              </p>
              <button
                type="button"
                onClick={() => removeItem(index)}
                className="flex h-8 w-8 items-center justify-center rounded text-zinc-400 transition-colors hover:text-red-500"
                disabled={items.length <= 1}
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}

          {/* Add Line Item */}
          <div className="px-3 py-2">
            <button
              type="button"
              onClick={addItem}
              className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"
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
            <span className="font-medium">
              {formatCurrency(subtotal, currency)}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-zinc-500">Tax</span>
            <Input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={taxRate}
              onChange={(e) => setTaxRate(e.target.value)}
              className="h-7 w-16 text-center text-xs"
            />
            <span className="text-zinc-500">%</span>
            <span className="ml-auto font-medium">
              {formatCurrency(taxAmount, currency)}
            </span>
          </div>
          <div className="flex items-center justify-between border-t border-zinc-200 pt-2 text-sm">
            <span className="font-semibold">Total</span>
            <span className="text-lg font-semibold">
              {formatCurrency(total, currency)}
            </span>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="notes">Notes (visible on invoice)</Label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            defaultValue={defaultValues?.notes ?? ""}
            placeholder="Payment terms, thank you message, etc."
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="internalNotes">Internal Notes</Label>
          <textarea
            id="internalNotes"
            name="internalNotes"
            rows={3}
            defaultValue={defaultValues?.internalNotes ?? ""}
            placeholder="Notes for your own reference"
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>
      </div>

      {/* Reverse Charge */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="reverseCharge"
          name="reverseCharge"
          value="true"
          defaultChecked={defaultValues?.reverseCharge === "true"}
          className="size-4 rounded border-zinc-300"
        />
        <Label htmlFor="reverseCharge" className="text-sm font-normal">
          Reverse charge (VAT not applicable)
        </Label>
      </div>

      {state?.error && (
        <p className="text-sm text-red-500">{state.error}</p>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/invoices")}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}
