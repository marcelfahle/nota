"use client";

import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
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
import { formatClientAddress } from "@/lib/postal-address";
import { formatTaxIdentifier, taxIdentifierFromColumns } from "@/lib/tax-identifier";
import { formatCurrency, formatDate, type Locale } from "@/lib/utils";

type BankAccountOption = {
  id: string;
  isDefault: boolean;
  name: string;
};

type Client = {
  address: string | null;
  bankAccountId: string | null;
  city: string | null;
  company: string | null;
  countryCode: string | null;
  createdAt: Date | null;
  defaultBuyerReference: string | null;
  defaultCurrency: string | null;
  email: string;
  id: string;
  name: string;
  notes: string | null;
  postalCode: string | null;
  publicSector: boolean;
  street: string | null;
  taxIdentifierCanonicalValue: string | null;
  taxIdentifierCountryCode: string | null;
  taxIdentifierType: "eu_vat" | "tax_id" | "us_ein" | null;
  taxIdentifierValue: string | null;
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
  locale = "en-US",
}: {
  bankAccounts: Array<BankAccountOption>;
  client: Client;
  invoices: Array<Invoice>;
  locale?: Locale;
}) {
  const t = useTranslations("clients");
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
        {t("backToClients")}
      </Link>

      <div className="mb-8 min-w-0 [overflow-wrap:anywhere]">
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
              {client.company && client.company !== client.name && (
                <span>{client.company} &middot; </span>
              )}
              {client.email}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setEditing(!editing)} size="sm" variant="outline">
            <Pencil className="size-4" />
            {editing ? t("detail.cancel") : t("detail.edit")}
          </Button>
          <Button
            className="text-red-600 hover:bg-red-50 hover:text-red-700"
            onClick={() => setDeleteOpen(true)}
            size="sm"
            variant="outline"
          >
            <Trash2 className="size-4" />
            {t("detail.delete")}
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
            submitLabel={t("updateClient")}
          />
        </div>
      ) : (
        <div className="mb-8 grid max-w-2xl gap-4 sm:grid-cols-2">
          <DetailItem label={t("detail.address")} value={formatClientAddress(client)} />
          <DetailItem
            label={client.publicSector ? t("detail.leitwegId") : t("detail.buyerReference")}
            value={
              client.publicSector
                ? (client.defaultBuyerReference ?? t("detail.missingReference"))
                : client.defaultBuyerReference
            }
          />
          <DetailItem
            label={t("detail.taxIdentifier")}
            value={formatTaxIdentifier(
              taxIdentifierFromColumns(client),
              locale === "de-DE" ? "de" : "en",
            )}
          />
          <DetailItem label={t("detail.currency")} value={client.defaultCurrency ?? "EUR"} />
          <DetailItem label={t("detail.notes")} value={client.notes} />
          {bankAccounts.length >= 2 && (
            <DetailItem
              label={t("detail.bankAccount")}
              value={
                client.bankAccountId
                  ? (bankAccounts.find((ba) => ba.id === client.bankAccountId)?.name ?? null)
                  : `${bankAccounts.find((ba) => ba.isDefault)?.name ?? ""} ${t("form.default")}`
              }
            />
          )}
        </div>
      )}

      <div>
        <h2 className="mb-4 text-sm font-semibold">
          {t("detail.invoices", { count: invoices.length })}
        </h2>
        {invoices.length === 0 ? (
          <p className="text-sm text-zinc-400">{t("detail.noInvoices")}</p>
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
                    {formatCurrency(Number(inv.total ?? 0), inv.currency ?? "EUR", locale)}
                  </span>
                  <p className="text-xs text-zinc-500">
                    {t("detail.due", { date: formatDate(inv.dueAt, locale) })}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <Dialog onOpenChange={setDeleteOpen} open={deleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("detail.deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("detail.deleteDescription", { name: client.name })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button disabled={deleting} onClick={() => setDeleteOpen(false)} variant="outline">
              {t("detail.cancel")}
            </Button>
            <Button disabled={deleting} onClick={handleDelete} variant="destructive">
              {deleting ? t("detail.deleting") : t("detail.delete")}
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
