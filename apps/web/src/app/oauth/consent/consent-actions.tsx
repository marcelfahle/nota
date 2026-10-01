"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { continueAfterAuth } from "@/lib/auth-redirect";

export function ConsentActions() {
  const [pending, setPending] = useState<"accept" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(accept: boolean) {
    setPending(accept ? "accept" : "deny");
    setError(null);
    // The client plugin attaches the signed query from this page's URL.
    const { data, error: consentError } = await authClient.oauth2.consent({ accept });
    if (consentError) {
      setPending(null);
      setError("This request expired. Start the connection again from your assistant.");
      return;
    }
    continueAfterAuth(data, "/invoices");
  }

  return (
    <div className="space-y-3">
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      <div className="flex gap-3">
        <Button
          className="flex-1"
          data-testid="oauth-deny"
          disabled={pending !== null}
          onClick={() => decide(false)}
          type="button"
          variant="outline"
        >
          {pending === "deny" ? "Cancelling..." : "Cancel"}
        </Button>
        <Button
          className="flex-1"
          data-testid="oauth-allow"
          disabled={pending !== null}
          onClick={() => decide(true)}
          type="button"
        >
          {pending === "accept" ? "Connecting..." : "Allow"}
        </Button>
      </div>
    </div>
  );
}
