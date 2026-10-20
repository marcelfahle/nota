"use client";

import { useTranslations } from "next-intl";
import posthog from "posthog-js";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function DeactivatedSignOut() {
  const t = useTranslations("deactivated");
  return (
    <Button
      onClick={async () => {
        try {
          posthog.reset();
          await authClient.signOut();
        } finally {
          window.location.assign("/login");
        }
      }}
      type="button"
      variant="outline"
    >
      {t("signOut")}
    </Button>
  );
}
