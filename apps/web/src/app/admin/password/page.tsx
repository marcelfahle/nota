import { redirect } from "next/navigation";

import { AdminPasswordForm } from "@/components/admin-password-form";
import { requireSuperAdmin } from "@/lib/auth";

export default async function AdminPasswordPage() {
  const admin = await requireSuperAdmin({ allowPasswordChange: true });
  if (!admin.mustChangePassword) {
    redirect("/admin");
  }
  return (
    <main className="grid min-h-dvh place-items-center bg-muted/30 px-4 py-12">
      <section className="w-full max-w-md space-y-6 rounded-lg border bg-background p-6 shadow-sm">
        <div className="space-y-2">
          <p className="nota-label">Nota administration</p>
          <h1 className="text-2xl">Choose a permanent password</h1>
          <p className="text-sm text-muted-foreground">
            This must be completed before the private admin view loads.
          </p>
        </div>
        <AdminPasswordForm />
      </section>
    </main>
  );
}
