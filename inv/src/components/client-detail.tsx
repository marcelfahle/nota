"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { updateClient, deleteClient } from "@/actions/clients";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ClientForm } from "@/components/client-form";

type Client = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  address: string | null;
  vatNumber: string | null;
  notes: string | null;
  defaultCurrency: string | null;
  createdAt: Date | null;
};

type Invoice = {
  id: string;
  number: string;
  status: "draft" | "sent" | "paid" | "overdue" | "cancelled" | null;
  total: string | null;
  currency: string | null;
  issuedAt: string;
  dueAt: string;
};

function formatCurrency(amount: number, currency = "EUR"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}

const statusColors: Record<string, string> = {
  draft: "bg-zinc-100 text-zinc-600",
  sent: "bg-blue-50 text-blue-700",
  paid: "bg-emerald-50 text-emerald-700",
  overdue: "bg-red-50 text-red-700",
  cancelled: "bg-zinc-100 text-zinc-500",
};

export function ClientDetailView({
  client,
  invoices,
}: {
  client: Client;
  invoices: Invoice[];
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
        href="/clients"
        className="mb-6 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"
      >
        <ArrowLeft className="size-4" />
        Back to clients
      </Link>

      <div className="mb-8 flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-sm font-medium text-zinc-600">
            {client.name
              .split(" ")
              .map((w) => w[0])
              .join("")
              .toUpperCase()
              .slice(0, 2)}
          </div>
          <div>
            <h1 className="text-lg font-semibold">{client.name}</h1>
            <p className="text-sm text-zinc-500">
              {client.company && <span>{client.company} &middot; </span>}
              {client.email}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditing(!editing)}
          >
            <Pencil className="size-4" />
            {editing ? "Cancel" : "Edit"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-red-600 hover:bg-red-50 hover:text-red-700"
            onClick={() => setDeleteOpen(true)}
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
            defaultValues={client}
            submitLabel="Update Client"
            onSuccess={() => setEditing(false)}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : (
        <div className="mb-8 grid max-w-2xl gap-4 sm:grid-cols-2">
          <DetailItem label="Address" value={client.address} />
          <DetailItem label="VAT Number" value={client.vatNumber} />
          <DetailItem label="Currency" value={client.defaultCurrency ?? "EUR"} />
          <DetailItem label="Notes" value={client.notes} />
        </div>
      )}

      <div>
        <h2 className="mb-4 text-sm font-semibold">
          Invoices ({invoices.length})
        </h2>
        {invoices.length === 0 ? (
          <p className="text-sm text-zinc-400">No invoices for this client.</p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {invoices.map((inv) => (
              <Link
                key={inv.id}
                href={`/invoices/${inv.id}`}
                className="-mx-4 flex items-center justify-between rounded-lg px-4 py-3 transition-colors hover:bg-zinc-50"
              >
                <div className="flex items-center gap-4">
                  <span className="font-mono text-sm">{inv.number}</span>
                  {inv.status && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[inv.status] ?? ""}`}
                    >
                      {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-sm font-medium">
                    {formatCurrency(
                      Number(inv.total ?? 0),
                      inv.currency ?? "EUR",
                    )}
                  </span>
                  <p className="text-xs text-zinc-500">
                    Due {inv.dueAt}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete client</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {client.name}? This action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-zinc-400">{label}</p>
      <p className="mt-1 text-sm text-zinc-900">{value || "—"}</p>
    </div>
  );
}
