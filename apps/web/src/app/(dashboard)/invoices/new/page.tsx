import { asc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { createInvoice } from "@/actions/invoices";
import { InvoiceForm } from "@/components/invoice-form";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { toIntlLocale } from "@/lib/i18n";
import { listWorkspaceBankAccounts } from "@/lib/invoice-document";

export default async function NewInvoicePage() {
  const { org, user } = await getCurrentUser();
  const t = await getTranslations("invoiceForm");

  const [accounts, clientList] = await Promise.all([
    listWorkspaceBankAccounts(org.id),
    db
      .select({
        bankAccountId: clients.bankAccountId,
        defaultBuyerReference: clients.defaultBuyerReference,
        defaultCurrency: clients.defaultCurrency,
        email: clients.email,
        id: clients.id,
        name: clients.name,
        publicSector: clients.publicSector,
      })
      .from(clients)
      .where(eq(clients.orgId, org.id))
      .orderBy(asc(clients.name)),
  ]);

  return (
    <div>
      <Link
        className="mb-6 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"
        href="/invoices"
      >
        <ArrowLeft className="size-4" />
        {t("backToInvoices")}
      </Link>

      <h1 className="mb-6 text-lg font-semibold">{t("newInvoice")}</h1>

      <div className="max-w-3xl">
        <InvoiceForm
          action={createInvoice}
          bankAccounts={accounts}
          clients={clientList}
          locale={toIntlLocale(user.locale)}
          org={{ countryCode: org.countryCode, defaultTaxTreatment: org.defaultTaxTreatment }}
        />
      </div>
    </div>
  );
}
