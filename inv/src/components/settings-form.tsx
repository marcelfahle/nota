"use client";

import { Pencil, Plus, Star, Trash2 } from "lucide-react";
import { useActionState, useMemo, useState } from "react";

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

export function SettingsForm({
  bankAccounts,
  lastIssuedNumber,
  settings,
}: {
  bankAccounts: Array<BankAccount>;
  lastIssuedNumber: string | null;
  settings: SettingsData;
}) {
  const [state, formAction, pending] = useActionState(updateSettings, null);

  const [prefix, setPrefix] = useState(settings.invoicePrefix ?? "");
  const [separator, setSeparator] = useState(settings.invoiceSeparator || "none");
  const [digits, setDigits] = useState(String(settings.invoiceDigits));
  const [nextNumber, setNextNumber] = useState(String(settings.nextInvoiceNumber ?? 1));

  const effectiveSeparator = separator === "none" ? "" : separator;

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
          <Label htmlFor="logoUrl">Logo URL</Label>
          <Input
            defaultValue={settings.logoUrl ?? ""}
            id="logoUrl"
            name="logoUrl"
            placeholder="https://example.com/logo.png"
            type="url"
          />
          <p className="text-xs text-zinc-500">
            Used in the app header. Leave blank to keep the text mark.
          </p>
        </div>

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
          <Select defaultValue={settings.defaultCurrency ?? "EUR"} name="defaultCurrency">
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="EUR">EUR</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
              <SelectItem value="GBP">GBP</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Invoice Numbering Section */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold">Invoice Numbering</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="invoicePrefix">Prefix</Label>
              <Input
                id="invoicePrefix"
                name="invoicePrefix"
                onChange={(e) => setPrefix(e.target.value)}
                placeholder="e.g. INV"
                value={prefix}
              />
            </div>
            <input name="invoiceSeparator" type="hidden" value={effectiveSeparator} />
            <div className={prefix ? "space-y-2" : "hidden"}>
              <Label>Separator</Label>
              <Select onValueChange={setSeparator} value={separator}>
                <SelectTrigger className="w-full">
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
              <Label>Digits</Label>
              <Select name="invoiceDigits" onValueChange={setDigits} value={digits}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} digits
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="nextInvoiceNumber">Next Number</Label>
            <Input
              className="w-full sm:w-48"
              id="nextInvoiceNumber"
              min="1"
              name="nextInvoiceNumber"
              onChange={(e) => setNextNumber(e.target.value)}
              type="number"
              value={nextNumber}
            />
          </div>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
            <p className="mb-1 text-xs font-medium text-zinc-500">Preview</p>
            <p className="font-mono text-sm">
              Your next invoice: <span className="font-semibold">{preview[0]}</span>
            </p>
            <p className="font-mono text-xs text-zinc-500">
              Then: {preview[1]}, {preview[2]}
            </p>
            {lastIssuedNumber && (
              <p className="mt-2 text-xs text-zinc-400">Last issued: {lastIssuedNumber}</p>
            )}
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

      {/* Bank Accounts Section */}
      <BankAccountsSection bankAccounts={bankAccounts} />
    </div>
  );
}

function BankAccountsSection({ bankAccounts }: { bankAccounts: Array<BankAccount> }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<BankAccount | null>(null);
  const [deleting, setDeleting] = useState(false);

  function openCreate() {
    setEditingAccount(null);
    setDialogOpen(true);
  }

  function openEdit(account: BankAccount) {
    setEditingAccount(account);
    setDialogOpen(true);
  }

  async function handleDelete() {
    if (!deleteConfirm) {
      return;
    }
    setDeleting(true);
    await deleteBankAccount(deleteConfirm.id);
    setDeleting(false);
    setDeleteConfirm(null);
  }

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold">Bank Accounts</h2>

      {bankAccounts.length === 0 ? (
        <p className="text-sm text-zinc-400">
          No bank accounts yet. Add one to include payment details on invoices.
        </p>
      ) : (
        <div className="space-y-3">
          {bankAccounts.map((account) => (
            <div
              className="flex items-start justify-between rounded-lg border border-zinc-200 p-4"
              key={account.id}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{account.name}</span>
                  {account.isDefault && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                      <Star className="size-3" />
                      Default
                    </span>
                  )}
                </div>
                <p className="mt-1 line-clamp-2 text-xs whitespace-pre-line text-zinc-500">
                  {account.details}
                </p>
              </div>
              <div className="ml-4 flex shrink-0 items-center gap-1">
                <Button onClick={() => openEdit(account)} size="sm" variant="ghost">
                  <Pencil className="size-3.5" />
                </Button>
                {!account.isDefault && (
                  <Button
                    className="text-red-500 hover:text-red-700"
                    onClick={() => setDeleteConfirm(account)}
                    size="sm"
                    variant="ghost"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Button onClick={openCreate} size="sm" variant="outline">
        <Plus className="size-4" />
        Add Bank Account
      </Button>

      {/* Create / Edit Dialog */}
      <BankAccountDialog
        account={editingAccount}
        onClose={() => setDialogOpen(false)}
        open={dialogOpen}
      />

      {/* Delete Confirmation */}
      <Dialog onOpenChange={(open) => !open && setDeleteConfirm(null)} open={!!deleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete bank account</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{deleteConfirm?.name}
              &rdquo;? Clients assigned to this account will lose their assignment.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button disabled={deleting} onClick={() => setDeleteConfirm(null)} variant="outline">
              Cancel
            </Button>
            <Button disabled={deleting} onClick={handleDelete} variant="destructive">
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BankAccountDialog({
  account,
  onClose,
  open,
}: {
  account: BankAccount | null;
  onClose: () => void;
  open: boolean;
}) {
  const isEditing = !!account;
  const action = isEditing ? updateBankAccount.bind(null, account.id) : createBankAccount;
  const [state, formAction, pending] = useActionState(
    async (prev: { error?: string; success?: boolean } | null, formData: FormData) => {
      const result = await action(prev, formData);
      if (result?.success) {
        onClose();
      }
      return result;
    },
    null,
  );

  return (
    <Dialog onOpenChange={(o) => !o && onClose()} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Bank Account" : "Add Bank Account"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bankAccountName">Account Name</Label>
            <Input
              defaultValue={account?.name ?? ""}
              id="bankAccountName"
              name="name"
              placeholder='e.g. "Wise EUR", "Mercury USD"'
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bankAccountDetails">Bank Details</Label>
            <textarea
              className="w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
              defaultValue={account?.details ?? ""}
              id="bankAccountDetails"
              name="details"
              placeholder={"IBAN: DE89 3704 0044 0532 0130 00\nBIC: COBADEFFXXX"}
              required
              rows={4}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              defaultChecked={account?.isDefault ?? false}
              id="bankAccountDefault"
              name="isDefault"
              type="checkbox"
              value="true"
            />
            <Label htmlFor="bankAccountDefault">Set as default account</Label>
          </div>
          {state?.error && <p className="text-sm text-red-500">{state.error}</p>}
          <DialogFooter>
            <Button disabled={pending} type="submit">
              {pending ? "Saving..." : isEditing ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
