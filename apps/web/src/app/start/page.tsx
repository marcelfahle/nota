import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { Onboarding } from "@/components/onboarding/onboarding";
import { getCurrentUserOrNull } from "@/lib/auth";
import { getOnboardingSession, ONBOARDING_COOKIE } from "@/lib/onboarding-session";
import { googleCredentials, googleErrorMessage } from "@/lib/social-auth";

export const metadata: Metadata = {
  description:
    "Type your website. Nota reads it and hands you your first invoice, already branded.",
  title: "Start with your website — Nota",
};

export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getCurrentUserOrNull()) {
    redirect("/home");
  }
  // Coming back within a day picks up the same preview.
  const session = await getOnboardingSession((await cookies()).get(ONBOARDING_COOKIE)?.value);
  const socialError = googleErrorMessage((await searchParams).error ?? null);
  return (
    <Onboarding
      googleEnabled={Boolean(googleCredentials())}
      initialError={socialError}
      initialProfile={session?.profile ?? null}
    />
  );
}
