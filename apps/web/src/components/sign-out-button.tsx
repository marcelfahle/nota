"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";

/**
 * Signs out and loads the sign-in page fresh. A full navigation, not a
 * client-side one: every cached page of the signed-in app is dropped with it.
 */
export function SignOutButton() {
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    try {
      await authClient.signOut();
    } finally {
      window.location.assign("/login");
    }
  }

  return (
    <button
      aria-label="Sign out"
      className="grid size-11 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-card hover:text-foreground active:bg-card disabled:opacity-50 md:size-9"
      data-testid="logout-button"
      disabled={pending}
      onClick={signOut}
      title="Sign out"
      type="button"
    >
      <LogOut className="size-4" />
    </button>
  );
}
