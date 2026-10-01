"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { continueAfterAuth } from "@/lib/auth-redirect";

type RegisterInvite = {
  email: string;
  orgName: string;
  role: "owner" | "admin" | "member";
  token: string;
};

export function RegisterForm({ invite }: { invite?: RegisterInvite | null }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const isInviteFlow = Boolean(invite);

  // With an invite token the user joins that workspace; otherwise they get
  // their own (see joinOrCreateWorkspace in better-auth.ts).
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);

    // Better Auth's sign-up accepts extra fields. The invite link's token is the
    // proof of access to that workspace.
    const signUp = {
      email: String(form.get("email") ?? "")
        .trim()
        .toLowerCase(),
      inviteToken: invite?.token,
      name: String(form.get("name") ?? "").trim(),
      password: String(form.get("password") ?? ""),
    };
    const { data, error: signUpError } = await authClient.signUp.email(signUp);

    if (signUpError) {
      setPending(false);
      setError(
        signUpError.code === "USER_ALREADY_EXISTS" ||
          signUpError.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"
          ? "An account already exists for that email"
          : signUpError.status === 400 && invite
            ? "This invite link is invalid, expired, or for a different email"
            : signUpError.code === "PASSWORD_TOO_SHORT"
              ? "Password must be at least 8 characters"
              : (signUpError.message ?? "Could not create your account"),
      );
      return;
    }

    continueAfterAuth(data);
  }

  return (
    <form className="space-y-4" data-testid="register-form" onSubmit={onSubmit}>
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
          minLength={8}
          name="password"
          required
          type="password"
        />
      </div>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      <Button className="w-full" data-testid="register-submit" disabled={pending} type="submit">
        {pending ? "Creating..." : invite ? "Accept Invite" : "Create account"}
      </Button>
    </form>
  );
}
