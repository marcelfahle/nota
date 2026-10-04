"use client";

import { useActionState } from "react";

import { changeTemporaryPassword, type AdminActionState } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AdminActionState = {};

export function AdminPasswordForm() {
  const [state, action, pending] = useActionState(changeTemporaryPassword, initialState);
  return (
    <form action={action} className="space-y-4" data-testid="admin-password-form">
      <div className="space-y-2">
        <Label htmlFor="currentPassword">Temporary password</Label>
        <Input
          autoComplete="current-password"
          autoFocus
          id="currentPassword"
          name="currentPassword"
          required
          type="password"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="newPassword">New password</Label>
        <Input
          autoComplete="new-password"
          id="newPassword"
          minLength={8}
          name="newPassword"
          required
          type="password"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmation">Confirm new password</Label>
        <Input
          autoComplete="new-password"
          id="confirmation"
          minLength={8}
          name="confirmation"
          required
          type="password"
        />
      </div>
      {state.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button className="w-full" disabled={pending} type="submit">
        {pending ? "Saving…" : "Set password"}
      </Button>
    </form>
  );
}
