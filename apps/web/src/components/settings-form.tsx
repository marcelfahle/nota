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
import { formatIbanDisplay, validateIban } from "@/lib/iban";
import { formatInvoiceNumber } from "@/lib/invoice-number";

type BankAccount = {
  accountType: string;
  bic: string | null;
  createdAt: Date;
  details: string;
  iban: string | null;
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
  accountType: "freeform" | "iban";
  bic: string;
  details: string;
  iban: string;
  ibanError: string | null;
  isDefault: boolean;
  name: string;
};

const EMPTY_FORM: BankAccountFormState = {
  accountType: "iban",
  bic: "",
  details: "",
  iban: "",
  ibanError: null,
  isDefault: false,
  name: "",
};

function formStateFromAccount(account: BankAccount): BankAccountFormState {
  return {
    accountType: account.accountType === "iban" ? "iban" : "freeform",
    bic: account.bic ?? "",
    details: account.details,
    iban: account.iban ?? "",
    ibanError: null,
    isDefault: account.isDefault,
    name: account.name,
  };
}

function BankAccountFormFields({
  formState,
  idPrefix,
  setFormState,
}: {
  formState: BankAccountFormState;
  idPrefix: string;
  setFormState: React.Dispatch<React.SetStateAction<BankAccountFormState>>;
}) {
  const handleIbanBlur = () => {
    if (!formState.iban) {
      setFormState((s) => ({ ...s, ibanError: null }));
      return;
    }
    const result = validateIban(formState.iban);
    setFormState((s) => ({ ...s, ibanError: result.valid ? null : (result.error ?? "Invalid IBAN") }));
  };

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-name`}>Name</Label>
        <Input
          id={`${idPrefix}-name`}
          name="name"
          onChange={(e) => setFormState((s) => ({ ...s, name: e.target.value }))}
          placeholder="Business account"
          required
          value={formState.name}
        />
      </div>

      <div className="space-y-2">
        <Label>Account Type</Label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              checked={formState.accountType === "iban"}
              name="accountType"
              onChange={() => setFormState((s) => ({ ...s, accountType: "iban", ibanError: null }))}
              type="radio"
              value="iban"
            />
            IBAN
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              checked={formState.accountType === "freeform"}
              name="accountType"
              onChange={() => setFormState((s) => ({ ...s, accountType: "freeform", ibanError: null }))}
              type="radio"
              value="freeform"
            />
            Freeform
          </label>
        </div>
      </div>

      {formState.accountType === "iban" ? (
        <>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-iban`}>IBAN</Label>
            <Input
              id={`${idPrefix}-iban`}
              name="iban"
              onBlur={handleIbanBlur}
              onChange={(e) => setFormState((s) => ({ ...s, iban: e.target.value, ibanError: null }))}
              placeholder="DE89 3704 0044 0532 0130 00"
              required
              value={formState.iban}
            />
            {formState.ibanError ? (
              <p className="text-sm text-red-600">{formState.ibanError}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-bic`}>BIC (optional)</Label>
            <Input
              id={`${idPrefix}-bic`}
              name="bic"
              onChange={(e) => setFormState((s) => ({ ...s, bic: e.target.value }))}
              placeholder="COBADEFFXXX"
              value={formState.bic}
            />
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-details`}>Details</Label>
          <textarea
            className="min-h-[140px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
            id={`${idPrefix}-details`}
            name="details"
            onChange={(e) => setFormState((s) => ({ ...s, details: e.target.value }))}
            placeholder="IBAN\nBIC\nBank name"
            required
            rows={6}
            value={formState.details}
          />
        </div>
      )}

      <label className="flex items-center gap-2 text-sm text-zinc-700">
        <input
          checked={formState.isDefault}
          name="isDefault"
          onChange={(e) => setFormState((s) => ({ ...s, isDefault: e.target.checked }))}
          type="checkbox"
          value="true"
        />
        Set as default account
      </label>
    </>
  );
}

function BankAccountsSection({
  accounts,
  canManageBankAccounts,
}: {
  accounts: Array<BankAccount>;
  canManageBankAccounts: boolean;
}) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [formState, setFormState] = useState<BankAccountFormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const openCreateDialog = () => {
    setFormState(EMPTY_FORM);
    setError(null);
    setIsCreateOpen(true);
  };

  const openEditDialog = (account: BankAccount) => {
    setEditingAccount(account);
    setFormState(formStateFromAccount(account));
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
                  {account.accountType === "iban" && account.iban ? (
                    <div className="text-sm leading-6 text-zinc-600">
                      <span className="font-mono">{formatIbanDisplay(account.iban)}</span>
                      {account.bic ? (
                        <span className="ml-3 text-zinc-500">BIC: {account.bic}</span>
                      ) : null}
                    </div>
                  ) : (
                    <pre className="font-sans text-sm leading-6 whitespace-pre-wrap text-zinc-600">
                      {account.details}
                    </pre>
                  )}
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
            <BankAccountFormFields
              formState={formState}
              idPrefix="create-bank-account"
              setFormState={setFormState}
            />
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
            <BankAccountFormFields
              formState={formState}
              idPrefix="edit-bank-account"
              setFormState={setFormState}
            />
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
