import Link from "next/link";

import { AuthShell } from "@/components/auth-shell";
import { RegisterForm } from "@/components/register-form";
import { getActiveInviteByToken } from "@/lib/invites";
import { googleCredentials, googleErrorMessage } from "@/lib/social-auth";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const { invite } = params;
  const query = new URLSearchParams(
    Object.entries(params).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
  const googleEnabled = Boolean(googleCredentials());
  const socialError = googleErrorMessage(params.error ?? null);
  const activeInvite = invite ? await getActiveInviteByToken(invite) : null;

  return (
    <AuthShell
      subtitle={
        <Link
          className="font-medium text-zinc-900 underline underline-offset-4"
          href={`/login${query.size ? `?${query}` : ""}`}
        >
          Back to sign in
        </Link>
      }
      title={activeInvite ? `Join ${activeInvite.orgName}` : "Create account"}
    >
      {socialError && (
        <p className="text-sm text-destructive" role="alert">
          {socialError}
        </p>
      )}
      {invite && !activeInvite ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            This invite link is invalid or expired. Ask your organization owner to send a fresh one,
            or create your own workspace instead.
          </div>
          <RegisterForm googleEnabled={googleEnabled} />
        </div>
      ) : (
        <RegisterForm googleEnabled={googleEnabled} invite={activeInvite} />
      )}
    </AuthShell>
  );
}
