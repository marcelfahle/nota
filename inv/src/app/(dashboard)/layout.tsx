import { and, desc, eq, isNotNull, or, sql } from "drizzle-orm";

import { DashboardShell } from "@/components/dashboard-shell";
import { APP_NAME } from "@/lib/app-brand";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { clients, invoices, jobs } from "@/lib/db/schema";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  const [stripeDockItems, emailJobItems, [emailJobSummary]] = await Promise.all([
    db
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
      .limit(8),
    db
      .select({
        attempts: jobs.attempts,
        clientName: clients.name,
        id: jobs.id,
        invoiceId: invoices.id,
        invoiceNumber: invoices.number,
        lastError: jobs.lastError,
        maxAttempts: jobs.maxAttempts,
        runAt: jobs.runAt,
        status: jobs.status,
        type: jobs.type,
        updatedAt: jobs.updatedAt,
      })
      .from(jobs)
      .innerJoin(invoices, and(eq(jobs.invoiceId, invoices.id), eq(invoices.userId, user.id)))
      .leftJoin(clients, and(eq(clients.id, invoices.clientId), eq(clients.userId, user.id)))
      .where(eq(invoices.userId, user.id))
      .orderBy(desc(jobs.updatedAt), desc(jobs.createdAt))
      .limit(8),
    db
      .select({
        dead: sql<number>`coalesce(sum(case when ${jobs.status} = 'dead' then 1 else 0 end), 0)::int`,
        pending: sql<number>`coalesce(sum(case when ${jobs.status} = 'pending' then 1 else 0 end), 0)::int`,
        processing: sql<number>`coalesce(sum(case when ${jobs.status} = 'processing' then 1 else 0 end), 0)::int`,
      })
      .from(jobs)
      .innerJoin(invoices, and(eq(jobs.invoiceId, invoices.id), eq(invoices.userId, user.id)))
      .where(eq(invoices.userId, user.id)),
  ]);

  return (
    <DashboardShell
      brandName={user.businessName || APP_NAME}
      emailJobItems={emailJobItems.map((item) => ({
        ...item,
        runAt: item.runAt?.toISOString() ?? null,
        updatedAt: item.updatedAt?.toISOString() ?? null,
      }))}
      emailJobSummary={{
        dead: emailJobSummary?.dead ?? 0,
        pending: emailJobSummary?.pending ?? 0,
        processing: emailJobSummary?.processing ?? 0,
      }}
      logoUrl={user.logoUrl}
      stripeDockItems={stripeDockItems.map((item) => ({
        ...item,
        paidAt: item.paidAt ?? null,
        sentAt: item.sentAt?.toISOString() ?? null,
        updatedAt: item.updatedAt?.toISOString() ?? null,
      }))}
    >
      {children}
    </DashboardShell>
  );
}
