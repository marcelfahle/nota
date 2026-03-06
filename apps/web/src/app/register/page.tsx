import Link from "next/link";

import { AuthShell } from "@/components/auth-shell";
import { RegisterForm } from "@/components/register-form";
import { getActiveInviteByToken } from "@/lib/invites";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const { invite } = await searchParams;
  const activeInvite = invite ? await getActiveInviteByToken(invite) : null;

  return (
    <AuthShell
      subtitle={
        <Link className="font-medium text-zinc-900 underline underline-offset-4" href="/login">
          Back to sign in
        </Link>
      }
      title={activeInvite ? `Join ${activeInvite.orgName}` : "Create account"}
    >
      {invite && !activeInvite ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            This invite link is invalid or expired. Ask your organization owner to send a fresh one,
            or create your own workspace instead.
          </div>
          <RegisterForm />
        </div>
      ) : (
        <RegisterForm invite={activeInvite} />
      )}
    </AuthShell>
  );
}
