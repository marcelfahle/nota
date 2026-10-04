"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";

import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { continueAfterAuth } from "@/lib/auth-redirect";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Keep a pending ChatGPT/Claude authorization when switching to sign-up.
  const query = searchParams.toString();
  // A plain visit starts with the website read; a pending authorization keeps the form.
  const registerHref = query ? `/register?${query}` : "/start";
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

    continueAfterAuth(data);
  }

  return (
    <AuthShell
      subtitle={
        <>
          New here?{" "}
          <Link
            className="font-medium text-zinc-900 underline underline-offset-4"
            href={registerHref}
          >
            Create an account
          </Link>
        </>
      }
      title="Sign in"
    >
      <form className="space-y-4" data-testid="login-form" onSubmit={onSubmit}>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            autoComplete="email"
            autoFocus
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
            data-testid="login-password"
            id="password"
            name="password"
            required
            type="password"
          />
        </div>

        {notice && <p className="text-sm text-emerald-600">{notice}</p>}
        {error && <p className="text-sm text-red-500">{error}</p>}

        <Button className="w-full" data-testid="login-submit" disabled={pending} type="submit">
          {pending ? "Signing in..." : "Sign in"}
        </Button>

        <div className="text-center text-sm">
          <Link className="text-zinc-500 hover:text-zinc-900" href="/forgot-password">
            Forgot your password?
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}
