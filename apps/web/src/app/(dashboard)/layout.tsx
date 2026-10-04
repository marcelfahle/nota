import { and, desc, eq, gt, isNotNull, isNull, or, sql } from "drizzle-orm";

import { DashboardShell } from "@/components/dashboard-shell";
import { APP_NAME } from "@/lib/app-brand";
import { getCurrentUser } from "@/lib/auth";
import { billingStatus } from "@/lib/billing";
import { db } from "@/lib/db";
import { clients, invoices, jobs, proposals } from "@/lib/db/schema";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { org, user } = await getCurrentUser();
  let domain: string | null = null;
  if (org.website) {
    try {
      domain = new URL(org.website.includes("://") ? org.website : `https://${org.website}`)
        .hostname;
    } catch {
      /* Older profiles can contain an incomplete website. */
    }
  }

  const [
    usage,
    stripeDockItems,
    emailJobItems,
    [emailJobSummary],
    [overdueSummary],
    [proposalSummary],
  ] = await Promise.all([
    billingStatus(org.id),
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
      .leftJoin(clients, and(eq(clients.id, invoices.clientId), eq(clients.orgId, org.id)))
      .where(
        and(
          eq(invoices.orgId, org.id),
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
      .innerJoin(invoices, and(eq(jobs.invoiceId, invoices.id), eq(invoices.orgId, org.id)))
      .leftJoin(clients, and(eq(clients.id, invoices.clientId), eq(clients.orgId, org.id)))
      .where(eq(invoices.orgId, org.id))
      .orderBy(desc(jobs.updatedAt), desc(jobs.createdAt))
      .limit(8),
    db
      .select({
        dead: sql<number>`coalesce(sum(case when ${jobs.status} = 'dead' then 1 else 0 end), 0)::int`,
        pending: sql<number>`coalesce(sum(case when ${jobs.status} = 'pending' then 1 else 0 end), 0)::int`,
        processing: sql<number>`coalesce(sum(case when ${jobs.status} = 'processing' then 1 else 0 end), 0)::int`,
      })
      .from(jobs)
      .innerJoin(invoices, and(eq(jobs.invoiceId, invoices.id), eq(invoices.orgId, org.id)))
      .where(eq(invoices.orgId, org.id)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(invoices)
      .where(
        and(
          eq(invoices.orgId, org.id),
          eq(invoices.kind, "invoice"),
          eq(invoices.status, "overdue"),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(proposals)
      .where(
        and(
          eq(proposals.orgId, org.id),
          eq(proposals.kind, "send_reminder"),
          eq(proposals.status, "pending"),
          or(isNull(proposals.expiresAt), gt(proposals.expiresAt, new Date())),
        ),
      ),
  ]);

  return (
    <DashboardShell
      account={{ email: user.email, name: user.name }}
      brandName={org.businessName || org.name || APP_NAME}
      domain={domain}
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
      logoUrl={org.logoUrl}
      navCounts={{
        overdue: overdueSummary?.count ?? 0,
        proposals: proposalSummary?.count ?? 0,
      }}
      stripeDockItems={stripeDockItems.map((item) => ({
        ...item,
        paidAt: item.paidAt ?? null,
        sentAt: item.sentAt?.toISOString() ?? null,
        updatedAt: item.updatedAt?.toISOString() ?? null,
      }))}
      usage={usage}
      userId={user.id}
    >
      {children}
    </DashboardShell>
  );
}
