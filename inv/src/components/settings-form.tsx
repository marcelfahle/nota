"use client";

import { useActionState } from "react";

import { updateSettings } from "@/actions/settings";
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

type SettingsData = {
  bankDetails: string | null;
  businessAddress: string | null;
  businessName: string | null;
  defaultCurrency: string | null;
  invoicePrefix: string | null;
  vatNumber: string | null;
};

export function SettingsForm({ settings }: { settings: SettingsData }) {
  const [state, formAction, pending] = useActionState(updateSettings, null);

  return (
    <form action={formAction} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="businessName">Business Name</Label>
          <Input
            defaultValue={settings.businessName ?? ""}
            id="businessName"
            name="businessName"
            placeholder="Your Business Name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="vatNumber">VAT Number</Label>
          <Input
            defaultValue={settings.vatNumber ?? ""}
            id="vatNumber"
            name="vatNumber"
            placeholder="e.g. DE123456789"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="businessAddress">Business Address</Label>
        <textarea
          className="w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
          defaultValue={settings.businessAddress ?? ""}
          id="businessAddress"
          name="businessAddress"
          placeholder="123 Business Street&#10;City, Country"
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="bankDetails">Bank Details (IBAN / BIC)</Label>
        <textarea
          className="w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
          defaultValue={settings.bankDetails ?? ""}
          id="bankDetails"
          name="bankDetails"
          placeholder="IBAN: DE89 3704 0044 0532 0130 00&#10;BIC: COBADEFFXXX"
          rows={3}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Default Currency</Label>
          <Select defaultValue={settings.defaultCurrency ?? "EUR"} name="defaultCurrency">
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
        <div className="space-y-2">
          <Label htmlFor="invoicePrefix">Invoice Prefix</Label>
          <Input
            defaultValue={settings.invoicePrefix ?? "INV"}
            id="invoicePrefix"
            name="invoicePrefix"
            placeholder="INV"
          />
          <p className="text-xs text-zinc-400">
            Invoices will be numbered as PREFIX-0001, PREFIX-0002, etc.
          </p>
        </div>
      </div>

      {state?.error && <p className="text-sm text-red-500">{state.error}</p>}

      <div className="flex items-center gap-3">
        <Button disabled={pending} type="submit">
          {pending ? "Saving..." : "Save Settings"}
        </Button>
        {state?.success && <span className="text-sm text-emerald-600">Settings saved</span>}
      </div>
    </form>
  );
}
