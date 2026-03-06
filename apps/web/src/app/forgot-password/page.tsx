"use client";

import Link from "next/link";
import { useActionState } from "react";

import { requestPasswordReset } from "@/actions/auth";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(requestPasswordReset, null);

  return (
    <AuthShell
      subtitle={
        <Link className="font-medium text-zinc-900 underline underline-offset-4" href="/login">
          Back to sign in
        </Link>
      }
      title="Reset password"
    >
      <form action={action} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input autoComplete="email" autoFocus id="email" name="email" required type="email" />
        </div>

        {state?.error ? <p className="text-sm text-red-500">{state.error}</p> : null}
        {state?.success ? <p className="text-sm text-emerald-600">{state.success}</p> : null}

        <Button className="w-full" disabled={pending} type="submit">
          {pending ? "Sending..." : "Send reset link"}
        </Button>
      </form>
    </AuthShell>
  );
}
