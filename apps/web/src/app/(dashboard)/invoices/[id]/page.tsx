import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { cache } from "react";

import { InvoiceDetailView } from "@/components/invoice-detail";
import { APP_NAME } from "@/lib/app-brand";
import { getCurrentUser } from "@/lib/auth";
import { formatOrgAddress } from "@/lib/branding";
import { db } from "@/lib/db";
import { clients, invoices } from "@/lib/db/schema";
import { documentLocaleOf } from "@/lib/i18n";
import { orgCountryCode } from "@/lib/invoice-compliance";
import { getInvoiceDetail } from "@/lib/invoice-service";
import { formatClientAddress, isDomestic } from "@/lib/postal-address";

const loadInvoiceWithClient = cache(async (orgId: string, invoiceId: string) => {
  const [record] = await db
    .select({
      clientEmail: clients.email,
      clientName: clients.name,
      invoice: invoices,
    })
    .from(invoices)
    .leftJoin(clients, and(eq(clients.id, invoices.clientId), eq(clients.orgId, orgId)))
    .where(and(eq(invoices.id, invoiceId), eq(invoices.orgId, orgId)))
    .limit(1);

  return record ?? null;
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { org } = await getCurrentUser();
  const [record, t] = await Promise.all([
    loadInvoiceWithClient(org.id, id),
    getTranslations("invoiceDetail"),
  ]);

  return {
    title: record
      ? t("pageTitle", {
          app: APP_NAME,
          client: record.clientName ?? t("kind.invoice"),
          number: record.invoice.number,
        })
      : t("pageTitleFallback", { app: APP_NAME }),
  };
}

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { org, role, user } = await getCurrentUser();

  const record = await loadInvoiceWithClient(org.id, id);

  if (!record) {
    notFound();
  }

  const [invoice, t] = await Promise.all([
    getInvoiceDetail(org.id, id),
    getTranslations("invoiceDetail"),
  ]);
  if (!invoice) {
    notFound();
  }

  // The preview prints addresses the way the document does: country named in
  // the document language, and left out when both parties are in one country.
  const address = {
    locale: documentLocaleOf(invoice, org),
    omitCountry: isDomestic({ countryCode: orgCountryCode(org) }, invoice.client ?? {}),
  };

  return (
    <InvoiceDetailView
      activities={invoice.activityLog.map((a) => ({
        action: a.action,
        createdAt: a.createdAt?.toISOString() ?? "",
        id: a.id,
        metadata: a.metadata,
        source: a.source,
        sourceClient: a.sourceClient,
      }))}
      business={{
        address: formatOrgAddress(org, address),
        brandColor: org.brandColor,
        logoUrl: org.logoUrl,
        name: org.businessName || org.name,
      }}
      documentLocale={address.locale}
      invoice={{
        ...invoice,
        client: invoice.client
          ? { ...invoice.client, address: formatClientAddress(invoice.client, address) }
          : { email: "", name: t("unknownClient") },
      }}
      locale={user.locale}
      role={role}
    />
  );
}
