import { asc, desc, eq } from "drizzle-orm";

import { logout } from "@/actions/auth";
import { listMembers } from "@/actions/members";
import { ApiKeysSettings } from "@/components/api-keys-settings";
import { BillingSettings } from "@/components/billing-settings";
import { ConnectedAppsSettings } from "@/components/connected-apps-settings";
import { SettingsForm } from "@/components/settings-form";
import { TeamSettings } from "@/components/team-settings";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { billingStatus } from "@/lib/billing";
import { db } from "@/lib/db";
import { apiKeys, bankAccounts, invoices, oauthClients, oauthConsents } from "@/lib/db/schema";
import { getInviteLink } from "@/lib/invites";
import {
  canManageApiKeys,
  canManageBankAccounts,
  canManageMembers,
  canManageSettings,
} from "@/lib/roles";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ billing?: string; connect?: string }>;
}) {
  const { org, role, user } = await getCurrentUser();
  const [billing, params] = await Promise.all([billingStatus(org.id), searchParams]);
  const connectNotices: Record<string, string> = {
    cancelled: "Stripe connection was cancelled.",
    expired: "The Stripe link expired. Continue Stripe setup to get a fresh link.",
    failed: "Stripe could not be connected. Please try again as the workspace owner.",
    returned: "Welcome back. Refresh your Stripe status to check whether setup is complete.",
    success: "Your Stripe account is connected.",
  };
  const notice =
    params.billing === "success"
      ? "Your payment is being confirmed. Refresh shortly to see your updated plan."
      : connectNotices[params.connect ?? ""];

  const [lastInvoice] = await db
    .select({ number: invoices.number })
    .from(invoices)
    .where(eq(invoices.orgId, org.id))
    .orderBy(desc(invoices.createdAt))
    .limit(1);

  const organizationBankAccounts = await db
    .select()
    .from(bankAccounts)
    .where(eq(bankAccounts.orgId, org.id))
    .orderBy(asc(bankAccounts.sortOrder), asc(bankAccounts.createdAt));

  const apiKeyRecords = canManageApiKeys(role)
    ? await db
        .select({
          createdAt: apiKeys.createdAt,
          id: apiKeys.id,
          keyPrefix: apiKeys.keyPrefix,
          lastUsedAt: apiKeys.lastUsedAt,
          name: apiKeys.name,
        })
        .from(apiKeys)
        .where(eq(apiKeys.orgId, org.id))
        .orderBy(desc(apiKeys.createdAt))
    : [];

  const connectedApps = await db
    .select({
      clientId: oauthConsents.clientId,
      connectedAt: oauthConsents.createdAt,
      name: oauthClients.name,
    })
    .from(oauthConsents)
    .innerJoin(oauthClients, eq(oauthClients.clientId, oauthConsents.clientId))
    .where(eq(oauthConsents.userId, user.id))
    .orderBy(desc(oauthConsents.createdAt));

  const teamData = canManageMembers(role) ? await listMembers() : null;

  const settings = {
    businessAddress: org.businessAddress,
    businessName: org.businessName,
    defaultCurrency: org.defaultCurrency,
    invoiceDigits: org.invoiceDigits,
    invoicePrefix: org.invoicePrefix,
    invoiceSeparator: org.invoiceSeparator,
    logoUrl: org.logoUrl,
    nextInvoiceNumber: org.nextInvoiceNumber,
    vatNumber: org.vatNumber,
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <form action={logout}>
          <Button data-testid="logout-button" type="submit" variant="outline">
            Sign out
          </Button>
        </form>
      </div>

      <div className="max-w-4xl space-y-8">
        <SettingsForm
          bankAccounts={organizationBankAccounts}
          canManageBankAccounts={canManageBankAccounts(role)}
          canManageSettings={canManageSettings(role)}
          lastIssuedNumber={lastInvoice?.number ?? null}
          settings={settings}
        />

        <BillingSettings canManage={canManageSettings(role)} notice={notice} status={billing} />

        <ConnectedAppsSettings apps={connectedApps} />

        {canManageApiKeys(role) ? <ApiKeysSettings apiKeys={apiKeyRecords} /> : null}

        {canManageMembers(role) && teamData && !("error" in teamData) ? (
          <TeamSettings
            currentUserId={user.id}
            members={teamData.members}
            organizationName={teamData.organizationName}
            pendingInvites={teamData.pendingInvites.map((invite) => ({
              createdAt: invite.createdAt,
              email: invite.email,
              expiresAt: invite.expiresAt,
              id: invite.id,
              inviteUrl: getInviteLink(invite.token),
              role: invite.role,
            }))}
          />
        ) : null}
      </div>
    </div>
  );
}
