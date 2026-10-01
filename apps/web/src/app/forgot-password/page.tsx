"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);

    const { error: requestError } = await authClient.requestPasswordReset({
      email: String(form.get("email") ?? "")
        .trim()
        .toLowerCase(),
      redirectTo: "/reset-password",
    });

    setPending(false);
    if (requestError) {
      setError(
        requestError.status === 429
          ? "Too many attempts. Try again in a minute."
          : "Could not send a reset link. Try again.",
      );
      return;
    }

    setSuccess("If that account exists, a password reset link has been sent.");
  }

  return (
    <AuthShell
      subtitle={
        <Link className="font-medium text-zinc-900 underline underline-offset-4" href="/login">
          Back to sign in
        </Link>
      }
      title="Reset password"
    >
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input autoComplete="email" autoFocus id="email" name="email" required type="email" />
        </div>

        {error ? <p className="text-sm text-red-500">{error}</p> : null}
        {success ? <p className="text-sm text-emerald-600">{success}</p> : null}

        <Button className="w-full" disabled={pending} type="submit">
          {pending ? "Sending..." : "Send reset link"}
        </Button>
      </form>
    </AuthShell>
  );
}
