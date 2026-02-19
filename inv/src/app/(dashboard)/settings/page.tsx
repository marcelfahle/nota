import { SettingsForm } from "@/components/settings-form";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export default async function SettingsPage() {
  const [user] = await db
    .select({
      bankDetails: users.bankDetails,
      businessAddress: users.businessAddress,
      businessName: users.businessName,
      defaultCurrency: users.defaultCurrency,
      invoicePrefix: users.invoicePrefix,
      vatNumber: users.vatNumber,
    })
    .from(users)
    .limit(1);

  const settings = user ?? {
    bankDetails: null,
    businessAddress: null,
    businessName: null,
    defaultCurrency: "EUR",
    invoicePrefix: "INV",
    vatNumber: null,
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Settings</h1>
      <div className="max-w-2xl">
        <SettingsForm settings={settings} />
      </div>
    </div>
  );
}
