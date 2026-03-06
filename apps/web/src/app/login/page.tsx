"use client";

import Link from "next/link";
import { useActionState } from "react";

import { login } from "@/actions/auth";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, null);

  return (
    <AuthShell
      subtitle={
        <>
          New here?{" "}
          <Link className="font-medium text-zinc-900 underline underline-offset-4" href="/register">
            Create an account
          </Link>
        </>
      }
      title="Sign in"
    >
      <form action={action} className="space-y-4" data-testid="login-form">
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

        {state?.error && <p className="text-sm text-red-500">{state.error}</p>}

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
