"use client";

import { useTranslations } from "next-intl";
import posthog from "posthog-js";
import { useState, type FormEvent } from "react";

import { GoogleSignIn } from "@/components/google-sign-in";
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

export function RegisterForm({
  googleEnabled = false,
  invite,
}: {
  googleEnabled?: boolean;
  invite?: RegisterInvite | null;
}) {
  const t = useTranslations("auth.register");
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
          ? t("exists")
          : signUpError.status === 400 && invite
            ? t("inviteBad")
            : signUpError.code === "PASSWORD_TOO_SHORT"
              ? t("passwordShort")
              : (signUpError.message ?? t("failed")),
      );
      return;
    }

    posthog.identify(data.user.id, {
      email: data.user.email,
      name: data.user.name,
    });
    posthog.capture("account_created", { signup_source: invite ? "invite" : "direct" });
    continueAfterAuth(data);
  }

  return (
    <form className="space-y-4" data-testid="register-form" onSubmit={onSubmit}>
      {invite ? (
        <div
          className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-left"
          data-testid="register-invite-banner"
        >
          <p className="text-sm font-medium text-zinc-900">{t("join", { org: invite.orgName })}</p>
          <p className="mt-1 text-sm text-zinc-500">
            {t.rich("inviteAccess", {
              email: (chunks) => <span className="font-medium text-zinc-700">{chunks}</span>,
              emailValue: invite.email,
              role: (chunks) => <span className="font-medium text-zinc-700">{chunks}</span>,
              roleValue: invite.role,
            })}
          </p>
        </div>
      ) : null}

      {googleEnabled && <GoogleSignIn disabled={pending} inviteToken={invite?.token} />}
      <div className="space-y-2">
        <Label htmlFor="name">{t("name")}</Label>
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
        <Label htmlFor="email">{t("email")}</Label>
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
        {invite ? <p className="text-xs text-zinc-500">{t("invitedEmail")}</p> : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">{t("password")}</Label>
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
        {pending ? t("creating") : invite ? t("acceptInvite") : t("createAccount")}
      </Button>
    </form>
  );
}
