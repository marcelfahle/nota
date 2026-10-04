import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { Onboarding } from "@/components/onboarding/onboarding";
import { getCurrentUserOrNull } from "@/lib/auth";
import { getOnboardingSession, ONBOARDING_COOKIE } from "@/lib/onboarding-session";

export const metadata: Metadata = {
  description:
    "Type your website. Nota reads it and hands you your first invoice, already branded.",
  title: "Start with your website — Nota",
};

export default async function StartPage() {
  if (await getCurrentUserOrNull()) {
    redirect("/home");
  }
  // Coming back within a day picks up the same preview.
  const session = await getOnboardingSession((await cookies()).get(ONBOARDING_COOKIE)?.value);
  return <Onboarding initialProfile={session?.profile ?? null} />;
}
