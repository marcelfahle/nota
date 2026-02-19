"use client";

import { useActionState } from "react";

import { login } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, null);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm space-y-8 px-4">
        <div className="text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-md bg-zinc-900">
            <span className="text-sm font-semibold text-white">inv</span>
          </div>
          <h1 className="mt-4 text-xl font-semibold tracking-tight">inv.</h1>
        </div>

        <form action={action} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input autoFocus id="password" name="password" required type="password" />
          </div>

          {state?.error && <p className="text-sm text-red-500">{state.error}</p>}

          <Button className="w-full" disabled={pending} type="submit">
            {pending ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
