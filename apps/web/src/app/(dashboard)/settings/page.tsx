import { asc, desc, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";

import { listMembers } from "@/actions/members";
import { ApiKeysSettings } from "@/components/api-keys-settings";
import { BillingSettings } from "@/components/billing-settings";
import { BrandSettings } from "@/components/brand-settings";
import { ConnectedApps } from "@/components/connected-apps";
import { EmailSettings } from "@/components/email-settings";
import { GoogleAccount } from "@/components/google-account";
import { LanguageSettings } from "@/components/language-settings";
import { BankAccountsSettings, NumberingSettings } from "@/components/settings-form";
import { SettingsTabs } from "@/components/settings-tabs";
import { TeamSettings } from "@/components/team-settings";
import { ThemeSettings } from "@/components/theme-settings";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { billingStatus } from "@/lib/billing";
import { listConnectedApps } from "@/lib/connected-apps";
import { db } from "@/lib/db";
import { accounts, apiKeys, bankAccounts, invoices } from "@/lib/db/schema";
import { getInviteLink } from "@/lib/invites";
import {
  canManageApiKeys,
  canManageBankAccounts,
  canManageMembers,
  canManageSettings,
} from "@/lib/roles";
import { googleCredentials } from "@/lib/social-auth";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ billing?: string; connect?: string; google?: string }>;
}) {
  const { org, role, user } = await getCurrentUser();
  const [billing, params, t] = await Promise.all([
    billingStatus(org.id),
    searchParams,
    getTranslations("settings"),
  ]);
  const [connections, userAccounts] = await Promise.all([
    listConnectedApps(user.id),
    db
      .select({ providerId: accounts.providerId })
      .from(accounts)
      .where(eq(accounts.userId, user.id)),
  ]);
  const connectNotices: Record<string, string> = {
    cancelled: t("notices.connectCancelled"),
    expired: t("notices.connectExpired"),
    failed: t("notices.connectFailed"),
    returned: t("notices.connectReturned"),
    success: t("notices.connectSuccess"),
  };
  const notice =
    params.billing === "success"
      ? t("notices.billingSuccess")
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

  const teamData = canManageMembers(role) ? await listMembers() : null;

  const settings = {
    defaultCurrency: org.defaultCurrency,
    invoiceDigits: org.invoiceDigits,
    invoicePrefix: org.invoicePrefix,
    invoiceSeparator: org.invoiceSeparator,
    nextInvoiceNumber: org.nextInvoiceNumber,
  };

  const brandSettings = {
    brandColor: org.brandColor,
    businessName: org.businessName,
    city: org.city,
    contactEmail: org.contactEmail,
    contactName: org.contactName,
    contactPhone: org.contactPhone,
    country: org.country,
    countryCode: org.countryCode,
    defaultTaxTreatment: org.defaultTaxTreatment,
    faviconUrl: org.faviconUrl,
    invoiceLayout: org.invoiceLayout,
    legalName: org.legalName,
    logoUrl: org.logoUrl,
    name: org.name,
    postalCode: org.postalCode,
    profileSources: org.profileSources,
    region: org.region,
    street: org.street,
    taxIdentifierCountryCode: org.taxIdentifierCountryCode,
    taxIdentifierType: org.taxIdentifierType,
    taxIdentifierValue: org.taxIdentifierValue,
    vatNumber: org.vatNumber,
    website: org.website,
  };

  const canManage = canManageSettings(role);

  return (
    <div className="mx-auto max-w-[860px] space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="nota-label mb-2.5">
            {t("title")}
            {org.website ? (
              <span className="font-normal tracking-normal normal-case opacity-60">
                {" "}
                {t("profileFrom", {
                  domain: org.website.replace(/^https?:\/\//, "").replace(/\/$/, ""),
                })}
              </span>
            ) : null}
          </p>
          <h1>{org.businessName || org.name}</h1>
        </div>
        <Button disabled title={t("readAgainUnavailable")} type="button" variant="outline">
          {t("readAgain")}
        </Button>
      </div>

      <SettingsTabs
        panels={{
          account: (
            <div className="space-y-8">
              <LanguageSettings locale={user.locale} />
              <ThemeSettings theme={user.theme} />
              {params.google === "failed" && (
                <p className="text-sm text-destructive" role="alert">
                  {t("notices.googleFailed")}
                </p>
              )}
              {googleCredentials() && (
                <GoogleAccount
                  email={user.email}
                  linked={userAccounts.some((account) => account.providerId === "google")}
                />
              )}
            </div>
          ),
          api: (
            <div className="space-y-8">
              <ConnectedApps connections={connections} />
              {canManageApiKeys(role) ? (
                <ApiKeysSettings apiKeys={apiKeyRecords} />
              ) : (
                <p className="text-sm text-muted-foreground">{t("onlyOwnersApiKeys")}</p>
              )}
            </div>
          ),
          brand: <BrandSettings canManage={canManage} settings={brandSettings} />,
          email: (
            <EmailSettings
              canManage={canManage}
              documentLocale={org.documentLocale}
              eInvoiceDelivery={org.eInvoiceDelivery}
            />
          ),
          numbering: (
            <NumberingSettings
              canManageSettings={canManage}
              lastIssuedNumber={lastInvoice?.number ?? null}
              settings={settings}
            />
          ),
          payments: (
            <div className="space-y-8">
              <BankAccountsSettings
                accounts={organizationBankAccounts}
                canManageBankAccounts={canManageBankAccounts(role)}
              />
              <BillingSettings canManage={canManage} notice={notice} status={billing} />
            </div>
          ),
          team:
            canManageMembers(role) && teamData && !("error" in teamData) ? (
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
            ) : (
              <p className="text-sm text-muted-foreground">{t("onlyOwnersTeam")}</p>
            ),
        }}
      />
    </div>
  );
}
