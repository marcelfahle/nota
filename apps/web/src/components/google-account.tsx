"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function GoogleAccount({ email, linked }: { email: string; linked: boolean }) {
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
      setError(
        "Could not connect Google. Use the Google account with the same email as your Nota account.",
      );
      setPending(false);
    }
  }
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Google sign-in</h2>
      <p className="text-sm text-muted-foreground">
        {linked
          ? "Google is connected. You can use it to sign in to Nota."
          : `Connect the Google account for ${email} to sign in without your Nota password.`}
      </p>
      {!linked && (
        <Button disabled={pending} onClick={connect} variant="outline">
          {pending ? "Opening Google…" : "Connect Google"}
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
