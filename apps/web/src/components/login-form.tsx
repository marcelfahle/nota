"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { useState, type FormEvent } from "react";

import { AuthShell } from "@/components/auth-shell";
import { GoogleSignIn } from "@/components/google-sign-in";
import { HighlighterSwipe } from "@/components/nota-marks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { continueAfterAuth } from "@/lib/auth-redirect";
import { googleErrorMessage } from "@/lib/social-auth";

export function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Keep a pending ChatGPT/Claude authorization when switching to sign-up.
  const query = searchParams.toString();
  // A plain visit starts with the website read; a pending authorization keeps the form.
  const registerHref = query ? `/register?${query}` : "/start";
  const socialError = googleErrorMessage(searchParams.get("error"));
  const notice =
    searchParams.get("reset") === "1" ? "Password updated. Sign in with your new password." : null;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);

    const { data, error: signInError } = await authClient.signIn.email({
      email: String(form.get("email") ?? "")
        .trim()
        .toLowerCase(),
      password: String(form.get("password") ?? ""),
    });

    if (signInError) {
      setPending(false);
      setError(
        signInError.status === 429
          ? "Too many attempts. Try again in a minute."
          : "Invalid email or password",
      );
      return;
    }

    posthog.identify(data.user.id, {
      email: data.user.email,
      name: data.user.name,
    });
    posthog.capture("user_signed_in");
    continueAfterAuth(data);
  }

  return (
    <AuthShell
      lead="Your invoices are right where you left them."
      subtitle={
        <>
          New here?{" "}
          <Link
            className="font-medium text-foreground underline underline-offset-4"
            data-testid="login-start"
            href={registerHref}
          >
            Start free
          </Link>
        </>
      }
      title={
        <>
          Welcome <HighlighterSwipe>back.</HighlighterSwipe>
        </>
      }
    >
      <form className="space-y-4" data-testid="login-form" onSubmit={onSubmit}>
        {googleEnabled && <GoogleSignIn disabled={pending} />}
        {socialError && (
          <p className="text-sm text-destructive" role="alert">
            {socialError}
          </p>
        )}
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            autoComplete="email"
            autoFocus
            className="h-12 bg-card md:text-base"
            data-testid="login-email"
            id="email"
            name="email"
            required
            type="email"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            autoComplete="current-password"
            className="h-12 bg-card md:text-base"
            data-testid="login-password"
            id="password"
            name="password"
            required
            type="password"
          />
        </div>

        {notice && <p className="text-sm text-foreground">{notice}</p>}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <Button
          className="h-12 w-full text-base font-semibold"
          data-testid="login-submit"
          disabled={pending}
          type="submit"
        >
          {pending ? "Signing in…" : "Sign in"}
        </Button>

        <div className="text-sm">
          <Link
            className="inline-flex min-h-11 items-center text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            href="/forgot-password"
          >
            Forgot your password?
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}
