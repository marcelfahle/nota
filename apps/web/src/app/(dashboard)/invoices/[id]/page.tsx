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
import { getInvoiceDetail } from "@/lib/invoice-service";
import { formatClientAddress } from "@/lib/postal-address";

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

  const invoice = await getInvoiceDetail(org.id, id);
  if (!invoice) {
    notFound();
  }

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
        address: formatOrgAddress(org),
        brandColor: org.brandColor,
        logoUrl: org.logoUrl,
        name: org.businessName || org.name,
      }}
      invoice={{
        ...invoice,
        client: invoice.client
          ? { ...invoice.client, address: formatClientAddress(invoice.client) }
          : { email: "", name: "Unknown" },
      }}
      locale={user.locale}
      role={role}
    />
  );
}
