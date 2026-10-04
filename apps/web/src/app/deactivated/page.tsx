import { redirect } from "next/navigation";

import { DeactivatedSignOut } from "@/components/deactivated-sign-out";
import { NotaGlyph } from "@/components/nota-marks";
import { getCurrentUserOrNull } from "@/lib/auth";

/** Where members of a deactivated workspace land instead of the app. */
export default async function DeactivatedPage() {
  const context = await getCurrentUserOrNull();
  if (!context) {
    redirect("/login");
  }
  if (!context.org.deactivatedAt) {
    redirect("/home");
  }
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-5 py-12 text-foreground">
      <div className="w-full max-w-md space-y-5">
        <div className="flex items-center gap-2">
          <NotaGlyph />
          <span className="text-lg font-bold tracking-tight">Nota.</span>
        </div>
        <h1 className="onboarding-title">This workspace is paused.</h1>
        <p className="font-voice text-xl text-muted-foreground">
          {context.org.name} has been deactivated. Your invoices and clients are still here, and
          invoices you already sent can still be opened and paid. Write to hello@withnota.com to
          turn it back on.
        </p>
        <DeactivatedSignOut />
      </div>
    </main>
  );
}
