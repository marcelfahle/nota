import { asc, desc, eq } from "drizzle-orm";

import { logout } from "@/actions/auth";
import { SettingsForm } from "@/components/settings-form";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { bankAccounts, invoices } from "@/lib/db/schema";

export default async function SettingsPage() {
  const user = await getCurrentUser();

  // Get last issued invoice number
  const [lastInvoice] = await db
    .select({ number: invoices.number })
    .from(invoices)
    .where(eq(invoices.userId, user.id))
    .orderBy(desc(invoices.createdAt))
    .limit(1);

  // Get bank accounts
  const userBankAccounts = await db
    .select()
    .from(bankAccounts)
    .where(eq(bankAccounts.userId, user.id))
    .orderBy(asc(bankAccounts.sortOrder), asc(bankAccounts.createdAt));

  const settings = {
    businessAddress: user.businessAddress,
    businessName: user.businessName,
    defaultCurrency: user.defaultCurrency,
    invoiceDigits: user.invoiceDigits,
    invoicePrefix: user.invoicePrefix,
    invoiceSeparator: user.invoiceSeparator,
    logoUrl: user.logoUrl,
    nextInvoiceNumber: user.nextInvoiceNumber,
    vatNumber: user.vatNumber,
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
          bankAccounts={userBankAccounts}
          lastIssuedNumber={lastInvoice?.number ?? null}
          settings={settings}
        />
      </div>
    </div>
  );
}
