import { SettingsForm } from "@/components/settings-form";
import { getCurrentUser } from "@/lib/auth";

export default async function SettingsPage() {
  const user = await getCurrentUser();

  const settings = {
    bankDetails: user.bankDetails,
    businessAddress: user.businessAddress,
    businessName: user.businessName,
    defaultCurrency: user.defaultCurrency,
    invoicePrefix: user.invoicePrefix,
    vatNumber: user.vatNumber,
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
