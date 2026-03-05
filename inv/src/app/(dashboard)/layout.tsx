import { and, desc, eq, isNotNull, or } from "drizzle-orm";

import { DashboardShell } from "@/components/dashboard-shell";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { clients, invoices } from "@/lib/db/schema";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  const stripeDockItems = await db
    .select({
      clientName: clients.name,
      id: invoices.id,
      number: invoices.number,
      paidAt: invoices.paidAt,
      sentAt: invoices.sentAt,
      status: invoices.status,
      stripePaymentIntentId: invoices.stripePaymentIntentId,
      stripePaymentLinkId: invoices.stripePaymentLinkId,
      stripePaymentLinkUrl: invoices.stripePaymentLinkUrl,
      updatedAt: invoices.updatedAt,
    })
    .from(invoices)
    .leftJoin(clients, and(eq(clients.id, invoices.clientId), eq(clients.userId, user.id)))
    .where(
      and(
        eq(invoices.userId, user.id),
        or(
          isNotNull(invoices.stripePaymentIntentId),
          isNotNull(invoices.stripePaymentLinkId),
          isNotNull(invoices.stripePaymentLinkUrl),
        ),
      ),
    )
    .orderBy(desc(invoices.updatedAt), desc(invoices.createdAt))
    .limit(8);

  return (
    <DashboardShell
      brandName={user.businessName || "inv."}
      logoUrl={user.logoUrl}
      stripeDockItems={stripeDockItems.map((item) => ({
        ...item,
        sentAt: item.sentAt?.toISOString() ?? null,
        updatedAt: item.updatedAt?.toISOString() ?? null,
      }))}
    >
      {children}
    </DashboardShell>
  );
}
