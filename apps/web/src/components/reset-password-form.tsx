"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export function ResetPasswordForm({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);

    // Resetting also signs out every other session for this account.
    const { error: resetError } = await authClient.resetPassword({
      newPassword: String(form.get("password") ?? ""),
      token,
    });

    if (resetError) {
      setPending(false);
      setError(
        resetError.code === "PASSWORD_TOO_SHORT"
          ? "Password must be at least 8 characters"
          : "Reset link is invalid or expired",
      );
      return;
    }

    window.location.assign("/login?reset=1");
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="space-y-2">
        <Label htmlFor="password">New password</Label>
        <Input
          autoComplete="new-password"
          autoFocus
          id="password"
          minLength={8}
          name="password"
          required
          type="password"
        />
      </div>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      <Button className="w-full" disabled={pending} type="submit">
        {pending ? "Updating..." : "Update password"}
      </Button>
    </form>
  );
}
