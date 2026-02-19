"use client";

import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { updateClient, deleteClient } from "@/actions/clients";
import { ClientForm } from "@/components/client-form";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";

type BankAccountOption = {
  id: string;
  isDefault: boolean;
  name: string;
};

type Client = {
  address: string | null;
  bankAccountId: string | null;
  company: string | null;
  createdAt: Date | null;
  defaultCurrency: string | null;
  email: string;
  id: string;
  name: string;
  notes: string | null;
  vatNumber: string | null;
};

type Invoice = {
  currency: string | null;
  dueAt: string;
  id: string;
  issuedAt: string;
  number: string;
  status: "draft" | "sent" | "paid" | "overdue" | "cancelled" | null;
  total: string | null;
};

export function ClientDetailView({
  bankAccounts,
  client,
  invoices,
}: {
  bankAccounts: BankAccountOption[];
  client: Client;
  invoices: Array<Invoice>;
}) {
  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  const boundUpdateAction = updateClient.bind(null, client.id);

  async function handleDelete() {
    setDeleting(true);
    await deleteClient(client.id);
    router.push("/clients");
  }

  return (
    <div>
      <Link
        className="mb-6 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"
        href="/clients"
      >
        <ArrowLeft className="size-4" />
        Back to clients
      </Link>

      <div className="mb-8">
        <div className="mb-4 flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-sm font-medium text-zinc-600">
            {client.name
              .split(" ")
              .map((w) => w[0])
              .join("")
              .toUpperCase()
              .slice(0, 2)}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">{client.name}</h1>
            <p className="truncate text-sm text-zinc-500">
              {client.company && <span>{client.company} &middot; </span>}
              {client.email}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setEditing(!editing)} size="sm" variant="outline">
            <Pencil className="size-4" />
            {editing ? "Cancel" : "Edit"}
          </Button>
          <Button
            className="text-red-600 hover:bg-red-50 hover:text-red-700"
            onClick={() => setDeleteOpen(true)}
            size="sm"
            variant="outline"
          >
            <Trash2 className="size-4" />
            Delete
          </Button>
        </div>
      </div>

      {editing ? (
        <div className="mb-8 max-w-2xl">
          <ClientForm
            action={boundUpdateAction}
            bankAccounts={bankAccounts}
            defaultValues={client}
            onCancel={() => setEditing(false)}
            onSuccess={() => setEditing(false)}
            submitLabel="Update Client"
          />
        </div>
      ) : (
        <div className="mb-8 grid max-w-2xl gap-4 sm:grid-cols-2">
          <DetailItem label="Address" value={client.address} />
          <DetailItem label="VAT Number" value={client.vatNumber} />
          <DetailItem label="Currency" value={client.defaultCurrency ?? "EUR"} />
          <DetailItem label="Notes" value={client.notes} />
          {bankAccounts.length >= 2 && (
            <DetailItem
              label="Bank Account"
              value={
                client.bankAccountId
                  ? bankAccounts.find((ba) => ba.id === client.bankAccountId)?.name ?? null
                  : (bankAccounts.find((ba) => ba.isDefault)?.name ?? "") + " (default)"
              }
            />
          )}
        </div>
      )}

      <div>
        <h2 className="mb-4 text-sm font-semibold">Invoices ({invoices.length})</h2>
        {invoices.length === 0 ? (
          <p className="text-sm text-zinc-400">No invoices for this client.</p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {invoices.map((inv) => (
              <Link
                className="-mx-4 flex items-center justify-between rounded-lg px-4 py-3 transition-colors hover:bg-zinc-50"
                href={`/invoices/${inv.id}`}
                key={inv.id}
              >
                <div className="flex items-center gap-4">
                  <span className="font-mono text-sm">{inv.number}</span>
                  {inv.status && <StatusBadge status={inv.status} />}
                </div>
                <div className="text-right">
                  <span className="text-sm font-medium">
                    {formatCurrency(Number(inv.total ?? 0), inv.currency ?? "EUR")}
                  </span>
                  <p className="text-xs text-zinc-500">Due {inv.dueAt}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <Dialog onOpenChange={setDeleteOpen} open={deleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete client</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {client.name}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button disabled={deleting} onClick={() => setDeleteOpen(false)} variant="outline">
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

function DetailItem({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium text-zinc-400">{label}</p>
      <p className="mt-1 text-sm text-zinc-900">{value || "—"}</p>
    </div>
  );
}
