"use client";

import posthog from "posthog-js";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function DeactivatedSignOut() {
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
      Sign out
    </Button>
  );
}
