"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function GoogleSignIn({
  beforeSignIn,
  disabled = false,
  inviteToken,
}: {
  beforeSignIn?: () => Promise<void>;
  disabled?: boolean;
  inviteToken?: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setPending(true);
    setError(null);
    try {
      await beforeSignIn?.();
      // Preserve the signed CLI/MCP query on errors too. The provider client
      // carries it through the social redirect on the successful path.
      const retry = new URL(window.location.href);
      retry.hash = "";
      retry.searchParams.delete("error");
      retry.searchParams.delete("error_description");
      const result = await authClient.signIn.social({
        additionalData: inviteToken ? { inviteToken } : undefined,
        callbackURL: "/home",
        errorCallbackURL: `${retry.pathname}${retry.search}`,
        provider: "google",
      });
      if (result.error) {
        throw new Error("Google sign-in is unavailable. Please try again.");
      }
    } catch {
      setError("Google sign-in is unavailable. Please try again, or use email and password.");
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <Button
        className="h-12 w-full gap-3 text-base"
        data-testid="google-sign-in"
        disabled={pending || disabled}
        onClick={signIn}
        type="button"
        variant="outline"
      >
        <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24">
          <path
            d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z"
            fill="#4285F4"
          />
          <path
            d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.97-3.38.97-2.6 0-4.8-1.76-5.6-4.13H3.05v2.59A10 10 0 0 0 12 22Z"
            fill="#34A853"
          />
          <path
            d="M6.4 13.92a6 6 0 0 1 0-3.84V7.49H3.05a10 10 0 0 0 0 9.02l3.35-2.59Z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.95c1.47 0 2.79.5 3.82 1.49l2.87-2.87A9.58 9.58 0 0 0 12 2a10 10 0 0 0-8.95 5.49l3.35 2.59c.8-2.37 3-4.13 5.6-4.13Z"
            fill="#EA4335"
          />
        </svg>
        {pending ? "Opening Google…" : "Continue with Google"}
      </Button>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or use email
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
