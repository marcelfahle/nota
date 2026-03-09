"use client";

import { Pencil, Plus, Star, Trash2 } from "lucide-react";
import { useActionState, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

import { createBankAccount, deleteBankAccount, updateBankAccount } from "@/actions/bank-accounts";
import { updateSettings } from "@/actions/settings";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatInvoiceNumber } from "@/lib/invoice-number";

type BankAccount = {
  createdAt: Date;
  details: string;
  id: string;
  isDefault: boolean;
  name: string;
  sortOrder: number;
  updatedAt: Date;
  userId: string;
};

type SettingsData = {
  businessAddress: string | null;
  businessName: string | null;
  defaultCurrency: string | null;
  invoiceDigits: number;
  invoicePrefix: string | null;
  invoiceSeparator: string;
  logoUrl: string | null;
  nextInvoiceNumber: number | null;
  vatNumber: string | null;
};

function LogoUploadField({
  canManageSettings,
  currentLogoUrl,
}: {
  canManageSettings: boolean;
  currentLogoUrl: string | null;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [selectedPreviewUrl, setSelectedPreviewUrl] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  function updateSelectedPreview(nextPreviewUrl: string | null) {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    setSelectedPreviewUrl(nextPreviewUrl);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setRemoveLogo(false);

    if (!file) {
      updateSelectedPreview(null);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    updateSelectedPreview(objectUrl);
    objectUrlRef.current = objectUrl;
  }

  function handleRemoveLogo() {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    setRemoveLogo(true);
    updateSelectedPreview(null);
  }

  const previewUrl = removeLogo ? null : (selectedPreviewUrl ?? currentLogoUrl);
  const hasPreview = Boolean(previewUrl);
  const removeButtonLabel =
    currentLogoUrl && !removeLogo && !selectedPreviewUrl
      ? "Remove current logo"
      : "Clear selection";

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50">
          {previewUrl ? (
            <img
              alt="Organization logo preview"
              className="h-full w-full object-contain"
              src={previewUrl}
            />
          ) : (
            <span className="px-3 text-center text-[11px] font-medium tracking-[0.2em] text-zinc-400 uppercase">
              No logo
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <Label htmlFor="logoFile">Logo</Label>
          <Input
            accept="image/png,image/jpeg,image/webp"
            data-testid="settings-logo-file"
            disabled={!canManageSettings}
            id="logoFile"
            name="logoFile"
            onChange={handleFileChange}
            ref={fileInputRef}
            type="file"
          />
          <input name="removeLogo" type="hidden" value={removeLogo ? "true" : "false"} />
          <p className="text-xs text-zinc-500">
            PNG, JPG, or WebP up to 2 MB. Used in the app header and invoice PDFs.
          </p>
          {removeLogo ? (
            <p className="text-xs text-amber-700">Logo will be removed when you save.</p>
          ) : null}
          {hasPreview && canManageSettings ? (
            <Button onClick={handleRemoveLogo} size="sm" type="button" variant="outline">
              <Trash2 className="size-4" />
              {removeButtonLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function SettingsForm({
  bankAccounts,
  canManageBankAccounts,
  canManageSettings,
  lastIssuedNumber,
  settings,
}: {
  bankAccounts: Array<BankAccount>;
  canManageBankAccounts: boolean;
  canManageSettings: boolean;
  lastIssuedNumber: string | null;
  settings: SettingsData;
}) {
  const [state, formAction, pending] = useActionState(updateSettings, null);

  const [prefix, setPrefix] = useState(settings.invoicePrefix ?? "");
  const [separator, setSeparator] = useState(settings.invoiceSeparator || "none");
  const [digits, setDigits] = useState(String(settings.invoiceDigits));
  const [nextNumber, setNextNumber] = useState(String(settings.nextInvoiceNumber ?? 1));

  const effectiveSeparator = separator === "none" ? "" : separator;
  const readOnlySettings = !canManageSettings;

  const preview = useMemo(() => {
    const num = Number.parseInt(nextNumber, 10) || 1;
    const d = Number.parseInt(digits, 10) || 4;
    return [0, 1, 2].map((offset) =>
      formatInvoiceNumber({
        digits: d,
        number: num + offset,
        prefix,
        separator: prefix ? effectiveSeparator : "",
      }),
    );
  }, [prefix, effectiveSeparator, digits, nextNumber]);

  return (
    <div className="space-y-10">
      <form action={formAction} className="space-y-6" encType="multipart/form-data">
        {readOnlySettings && (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
            Only organization owners can update these settings.
          </div>
        )}
        <fieldset className="space-y-6" disabled={readOnlySettings}>
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

          <LogoUploadField
            canManageSettings={canManageSettings}
            currentLogoUrl={settings.logoUrl}
            key={settings.logoUrl ?? "no-logo"}
          />

          <div className="space-y-2">
            <Label htmlFor="businessAddress">Business Address</Label>
            <textarea
              className="w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
              defaultValue={settings.businessAddress ?? ""}
              id="businessAddress"
              name="businessAddress"
              placeholder={"123 Business Street\nCity, Country"}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Default Currency</Label>
            <Select
              defaultValue={settings.defaultCurrency ?? "EUR"}
              disabled={readOnlySettings}
              name="defaultCurrency"
            >
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EUR">EUR (€)</SelectItem>
                <SelectItem value="USD">USD ($)</SelectItem>
                <SelectItem value="GBP">GBP (£)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="invoicePrefix">Invoice Prefix</Label>
            <Input
              disabled={readOnlySettings}
              id="invoicePrefix"
              name="invoicePrefix"
              onChange={(event) => setPrefix(event.target.value.toUpperCase())}
              value={prefix}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="invoiceSeparator">Separator</Label>
              <Select
                disabled={readOnlySettings}
                name="invoiceSeparator"
                onValueChange={(value) => setSeparator(value)}
                value={separator}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="-">Dash (-)</SelectItem>
                  <SelectItem value="/">Slash (/)</SelectItem>
                  <SelectItem value=".">Dot (.)</SelectItem>
                  <SelectItem value="none">None</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="invoiceDigits">Number of Digits</Label>
              <Input
                disabled={readOnlySettings}
                id="invoiceDigits"
                max={10}
                min={3}
                name="invoiceDigits"
                onChange={(event) => setDigits(event.target.value)}
                type="number"
                value={digits}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="nextInvoiceNumber">Next Invoice Number</Label>
              <Input
                disabled={readOnlySettings}
                id="nextInvoiceNumber"
                min={1}
                name="nextInvoiceNumber"
                onChange={(event) => setNextNumber(event.target.value)}
                type="number"
                value={nextNumber}
              />
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-zinc-900">Invoice number preview</p>
                <p className="text-xs text-zinc-500">
                  Last issued: {lastIssuedNumber ?? "None yet"}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {preview.map((value) => (
                <span
                  className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700"
                  key={value}
                >
                  {value}
                </span>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button disabled={pending || readOnlySettings} type="submit">
              Save Settings
            </Button>
            {state?.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
            {state?.success ? <p className="text-sm text-green-600">Settings updated.</p> : null}
          </div>
        </fieldset>
      </form>

      <BankAccountsSection accounts={bankAccounts} canManageBankAccounts={canManageBankAccounts} />
    </div>
  );
}

type BankAccountFormState = {
  details: string;
  isDefault: boolean;
  name: string;
};

function BankAccountsSection({
  accounts,
  canManageBankAccounts,
}: {
  accounts: Array<BankAccount>;
  canManageBankAccounts: boolean;
}) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [formState, setFormState] = useState<BankAccountFormState>({
    details: "",
    isDefault: false,
    name: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const openCreateDialog = () => {
    setFormState({ details: "", isDefault: false, name: "" });
    setError(null);
    setIsCreateOpen(true);
  };

  const openEditDialog = (account: BankAccount) => {
    setEditingAccount(account);
    setFormState({ details: account.details, isDefault: account.isDefault, name: account.name });
    setError(null);
  };

  const closeDialogs = () => {
    setIsCreateOpen(false);
    setEditingAccount(null);
    setError(null);
    setIsPending(false);
  };

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsPending(true);
    const payload = new FormData(event.currentTarget);
    const result = await createBankAccount(null, payload);

    if (result?.error) {
      setError(result.error);
      setIsPending(false);
      return;
    }

    closeDialogs();
  };

  const handleUpdate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingAccount) {
      return;
    }

    setIsPending(true);
    const payload = new FormData(event.currentTarget);
    payload.set("id", editingAccount.id);
    const result = await updateBankAccount(editingAccount.id, null, payload);

    if (result?.error) {
      setError(result.error);
      setIsPending(false);
      return;
    }

    closeDialogs();
  };

  const handleDelete = async (accountId: string) => {
    const result = await deleteBankAccount(accountId);
    if (result?.error) {
      setError(result.error);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-medium text-zinc-900">Bank Accounts</h2>
          <p className="text-sm text-zinc-500">
            Manage the payout instructions shown on your invoices.
          </p>
        </div>
        <Button disabled={!canManageBankAccounts} onClick={openCreateDialog} type="button">
          <Plus className="size-4" />
          New Account
        </Button>
      </div>

      {!canManageBankAccounts ? (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
          Only owners and admins can manage bank accounts.
        </div>
      ) : null}

      {error ? <div className="text-sm text-red-600">{error}</div> : null}

      <div className="grid gap-4">
        {accounts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 px-6 py-12 text-center text-sm text-zinc-500">
            No bank accounts yet.
          </div>
        ) : (
          accounts.map((account) => (
            <div
              className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"
              key={account.id}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-zinc-900">{account.name}</h3>
                    {account.isDefault ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700">
                        <Star className="size-3" />
                        Default
                      </span>
                    ) : null}
                  </div>
                  <pre className="font-sans text-sm leading-6 whitespace-pre-wrap text-zinc-600">
                    {account.details}
                  </pre>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => openEditDialog(account)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <Pencil className="size-4" />
                    Edit
                  </Button>
                  <Button
                    onClick={() => handleDelete(account.id)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <Trash2 className="size-4" />
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <Dialog onOpenChange={setIsCreateOpen} open={isCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New bank account</DialogTitle>
            <DialogDescription>
              Add payout instructions to show on future invoices.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleCreate}>
            <div className="space-y-2">
              <Label htmlFor="create-bank-account-name">Name</Label>
              <Input
                id="create-bank-account-name"
                name="name"
                onChange={(event) =>
                  setFormState((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Business account"
                required
                value={formState.name}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-bank-account-details">Details</Label>
              <textarea
                className="min-h-[140px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                id="create-bank-account-details"
                name="details"
                onChange={(event) =>
                  setFormState((current) => ({ ...current, details: event.target.value }))
                }
                placeholder="IBAN\nBIC\nBank name"
                required
                rows={6}
                value={formState.details}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                checked={formState.isDefault}
                name="isDefault"
                onChange={(event) =>
                  setFormState((current) => ({ ...current, isDefault: event.target.checked }))
                }
                type="checkbox"
                value="true"
              />
              Set as default account
            </label>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <DialogFooter>
              <Button onClick={closeDialogs} type="button" variant="ghost">
                Cancel
              </Button>
              <Button disabled={isPending} type="submit">
                Save account
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={(open) => !open && closeDialogs()} open={Boolean(editingAccount)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit bank account</DialogTitle>
            <DialogDescription>
              Update the payout instructions shown on your invoices.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleUpdate}>
            <div className="space-y-2">
              <Label htmlFor="edit-bank-account-name">Name</Label>
              <Input
                id="edit-bank-account-name"
                name="name"
                onChange={(event) =>
                  setFormState((current) => ({ ...current, name: event.target.value }))
                }
                required
                value={formState.name}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-bank-account-details">Details</Label>
              <textarea
                className="min-h-[140px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                id="edit-bank-account-details"
                name="details"
                onChange={(event) =>
                  setFormState((current) => ({ ...current, details: event.target.value }))
                }
                required
                rows={6}
                value={formState.details}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                checked={formState.isDefault}
                name="isDefault"
                onChange={(event) =>
                  setFormState((current) => ({ ...current, isDefault: event.target.checked }))
                }
                type="checkbox"
                value="true"
              />
              Set as default account
            </label>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <DialogFooter>
              <Button onClick={closeDialogs} type="button" variant="ghost">
                Cancel
              </Button>
              <Button disabled={isPending} type="submit">
                Update account
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
