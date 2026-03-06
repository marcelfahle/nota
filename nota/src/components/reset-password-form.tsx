"use client";

import { useActionState } from "react";

import { resetPassword } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPassword, null);

  return (
    <form action={action} className="space-y-4">
      <input name="token" type="hidden" value={token} />

      <div className="space-y-2">
        <Label htmlFor="password">New password</Label>
        <Input
          autoComplete="new-password"
          autoFocus
          id="password"
          name="password"
          required
          type="password"
        />
      </div>

      {state?.error ? <p className="text-sm text-red-500">{state.error}</p> : null}

      <Button className="w-full" disabled={pending} type="submit">
        {pending ? "Updating..." : "Update password"}
      </Button>
    </form>
  );
}
