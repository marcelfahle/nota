import Link from "next/link";

import { AuthShell } from "@/components/auth-shell";
import { ResetPasswordForm } from "@/components/reset-password-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <AuthShell
      subtitle={
        <Link className="font-medium text-zinc-900 underline underline-offset-4" href="/login">
          Back to sign in
        </Link>
      }
      title="Choose a new password"
    >
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <p className="text-sm text-red-500">Reset link is missing or invalid.</p>
      )}
    </AuthShell>
  );
}
