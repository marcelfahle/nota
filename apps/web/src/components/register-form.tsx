"use client";

import { useActionState } from "react";

import { register } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type RegisterInvite = {
  email: string;
  orgName: string;
  role: "owner" | "admin" | "member";
  token: string;
};

export function RegisterForm({ invite }: { invite?: RegisterInvite | null }) {
  const [state, action, pending] = useActionState(register, null);
  const isInviteFlow = Boolean(invite);

  return (
    <form action={action} className="space-y-4" data-testid="register-form">
      {invite ? (
        <div
          className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-left"
          data-testid="register-invite-banner"
        >
          <p className="text-sm font-medium text-zinc-900">Join {invite.orgName}</p>
          <p className="mt-1 text-sm text-zinc-500">
            This invite gives <span className="font-medium text-zinc-700">{invite.role}</span>{" "}
            access for <span className="font-medium text-zinc-700">{invite.email}</span>.
          </p>
        </div>
      ) : null}

      {invite ? <input name="invite" type="hidden" value={invite.token} /> : null}

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
          defaultValue={invite?.email ?? ""}
          id="email"
          name="email"
          readOnly={isInviteFlow}
          required
          type="email"
        />
        {invite ? (
          <p className="text-xs text-zinc-500">The invited email is fixed for this link.</p>
        ) : null}
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
        {pending ? "Creating..." : invite ? "Accept Invite" : "Create account"}
      </Button>
    </form>
  );
}
