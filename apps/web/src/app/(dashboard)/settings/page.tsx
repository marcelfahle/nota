import { asc, desc, eq } from "drizzle-orm";

import { logout } from "@/actions/auth";
import { SettingsForm } from "@/components/settings-form";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { bankAccounts, invoices } from "@/lib/db/schema";
import { canManageBankAccounts, canManageSettings } from "@/lib/roles";

export default async function SettingsPage() {
  const { org, role } = await getCurrentUser();

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
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <form action={logout}>
          <Button data-testid="logout-button" type="submit" variant="outline">
            Sign out
          </Button>
        </form>
      </div>
      <div className="max-w-2xl">
        <SettingsForm
          bankAccounts={organizationBankAccounts}
          canManageBankAccounts={canManageBankAccounts(role)}
          canManageSettings={canManageSettings(role)}
          lastIssuedNumber={lastInvoice?.number ?? null}
          settings={settings}
        />
      </div>
    </div>
  );
}
