import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { InvoiceDetailView } from "@/components/invoice-detail";
import { APP_NAME } from "@/lib/app-brand";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { clients, invoices } from "@/lib/db/schema";
import { getInvoiceDetail } from "@/lib/invoice-service";

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
  const record = await loadInvoiceWithClient(org.id, id);

  return {
    title: record
      ? `${record.invoice.number} · ${record.clientName ?? "Invoice"} — ${APP_NAME}`
      : `Invoice — ${APP_NAME}`,
  };
}

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { org, role } = await getCurrentUser();

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
        address: org.businessAddress,
        brandColor: org.brandColor,
        city: org.city,
        country: org.country,
        logoUrl: org.logoUrl,
        name: org.businessName || org.name,
        region: org.region,
      }}
      invoice={{
        ...invoice,
        client: invoice.client ?? { email: "", name: "Unknown" },
      }}
      role={role}
    />
  );
}
