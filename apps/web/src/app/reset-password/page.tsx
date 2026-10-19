import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { AuthShell } from "@/components/auth-shell";
import { ResetPasswordForm } from "@/components/reset-password-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const [{ token }, t] = await Promise.all([searchParams, getTranslations("auth.reset")]);

  return (
    <AuthShell
      subtitle={
        <Link className="font-medium text-zinc-900 underline underline-offset-4" href="/login">
          {t("backToSignIn")}
        </Link>
      }
      title={t("title")}
    >
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <p className="text-sm text-red-500">{t("missing")}</p>
      )}
    </AuthShell>
  );
}
