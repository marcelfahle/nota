"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
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

type ClientFormProps = {
  action: (
    state: ActionState,
    formData: FormData,
  ) => Promise<ActionState>;
  defaultValues?: {
    name?: string;
    email?: string;
    company?: string | null;
    address?: string | null;
    vatNumber?: string | null;
    notes?: string | null;
    defaultCurrency?: string | null;
  };
  submitLabel?: string;
  redirectTo?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
};

export function ClientForm({
  action,
  defaultValues,
  submitLabel = "Save Client",
  redirectTo,
  onSuccess,
  onCancel,
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
          <Input
            id="name"
            name="name"
            defaultValue={defaultValues?.name ?? ""}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email *</Label>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={defaultValues?.email ?? ""}
            required
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="company">Company</Label>
          <Input
            id="company"
            name="company"
            defaultValue={defaultValues?.company ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="vatNumber">VAT Number</Label>
          <Input
            id="vatNumber"
            name="vatNumber"
            defaultValue={defaultValues?.vatNumber ?? ""}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="address">Address</Label>
        <Input
          id="address"
          name="address"
          defaultValue={defaultValues?.address ?? ""}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Input
          id="notes"
          name="notes"
          defaultValue={defaultValues?.notes ?? ""}
        />
      </div>

      <div className="space-y-2">
        <Label>Currency</Label>
        <Select
          name="defaultCurrency"
          defaultValue={defaultValues?.defaultCurrency ?? "EUR"}
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

      {state?.error && (
        <p className="text-sm text-red-500">{state.error}</p>
      )}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}
