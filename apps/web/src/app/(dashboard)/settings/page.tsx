import { asc, desc, eq } from "drizzle-orm";

import { logout } from "@/actions/auth";
import { listMembers } from "@/actions/members";
import { ApiKeysSettings } from "@/components/api-keys-settings";
import { SettingsForm } from "@/components/settings-form";
import { TeamSettings } from "@/components/team-settings";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { apiKeys, bankAccounts, invoices } from "@/lib/db/schema";
import { getInviteLink } from "@/lib/invites";
import {
  canManageApiKeys,
  canManageBankAccounts,
  canManageMembers,
  canManageSettings,
} from "@/lib/roles";

export default async function SettingsPage() {
  const { org, role, user } = await getCurrentUser();

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
