"use client";

import Link from "next/link";
import { useActionState } from "react";

import { register } from "@/actions/auth";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function RegisterPage() {
  const [state, action, pending] = useActionState(register, null);

  return (
    <AuthShell
      subtitle={
        <>
          Already have an account?{" "}
          <Link className="font-medium text-zinc-900 underline underline-offset-4" href="/login">
            Sign in
          </Link>
        </>
      }
      title="Create account"
    >
      <form action={action} className="space-y-4" data-testid="register-form">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            autoComplete="name"
            autoFocus
            data-testid="register-name"
            id="name"
            name="name"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            autoComplete="email"
            data-testid="register-email"
            id="email"
            name="email"
            required
            type="email"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            autoComplete="new-password"
            data-testid="register-password"
            id="password"
            name="password"
            required
            type="password"
          />
        </div>

        {state?.error ? <p className="text-sm text-red-500">{state.error}</p> : null}

        <Button className="w-full" data-testid="register-submit" disabled={pending} type="submit">
          {pending ? "Creating..." : "Create account"}
        </Button>
      </form>
    </AuthShell>
  );
}
