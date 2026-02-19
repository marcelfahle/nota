"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

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

type ActionState = { error?: string; success?: boolean } | null;

type BankAccountOption = {
  id: string;
  isDefault: boolean;
  name: string;
};

type ClientFormProps = {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  bankAccounts?: BankAccountOption[];
  defaultValues?: {
    address?: string | null;
    bankAccountId?: string | null;
    company?: string | null;
    defaultCurrency?: string | null;
    email?: string;
    name?: string;
    notes?: string | null;
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
  submitLabel = "Save Client",
}: ClientFormProps) {
  const [state, formAction, pending] = useActionState(action, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.success) {
      if (redirectTo) {
        router.push(redirectTo);
      }
      onSuccess?.();
    }
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Name *</Label>
          <Input defaultValue={defaultValues?.name ?? ""} id="name" name="name" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email *</Label>
          <Input
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
          <Label htmlFor="company">Company</Label>
          <Input defaultValue={defaultValues?.company ?? ""} id="company" name="company" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="vatNumber">VAT Number</Label>
          <Input defaultValue={defaultValues?.vatNumber ?? ""} id="vatNumber" name="vatNumber" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="address">Address</Label>
        <Input defaultValue={defaultValues?.address ?? ""} id="address" name="address" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Input defaultValue={defaultValues?.notes ?? ""} id="notes" name="notes" />
      </div>

      <div className="space-y-2">
        <Label>Currency</Label>
        <Select defaultValue={defaultValues?.defaultCurrency ?? "EUR"} name="defaultCurrency">
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

      {bankAccounts && bankAccounts.length >= 2 && (
        <div className="space-y-2">
          <Label>Bank Account</Label>
          <Select
            defaultValue={defaultValues?.bankAccountId ?? ""}
            name="bankAccountId"
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Use default account" />
            </SelectTrigger>
            <SelectContent>
              {bankAccounts.map((ba) => (
                <SelectItem key={ba.id} value={ba.id}>
                  {ba.name}
                  {ba.isDefault ? " (default)" : ""}
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
            Cancel
          </Button>
        )}
        <Button disabled={pending} type="submit">
          {pending ? "Saving..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}
