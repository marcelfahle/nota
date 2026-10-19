"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function GoogleAccount({ email, linked }: { email: string; linked: boolean }) {
  const t = useTranslations("settings.google");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function connect() {
    setPending(true);
    try {
      const result = await authClient.linkSocial({
        callbackURL: "/settings#account",
        errorCallbackURL: "/settings?google=failed#account",
        provider: "google",
      });
      if (result.error) {
        throw new Error("Unable to connect Google");
      }
    } catch {
      setError(t("failed"));
      setPending(false);
    }
  }
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{t("heading")}</h2>
      <p className="text-sm text-muted-foreground">
        {linked ? t("linked") : t("connectFor", { email })}
      </p>
      {!linked && (
        <Button disabled={pending} onClick={connect} variant="outline">
          {pending ? t("opening") : t("connect")}
        </Button>
      )}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
