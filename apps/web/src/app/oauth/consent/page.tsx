import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth-shell";
import { getActiveUserOrNull } from "@/lib/auth";
import { auth } from "@/lib/better-auth";

import { ConsentActions } from "./consent-actions";

const PERMISSIONS = ["read", "draft", "send", "manage"] as const;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function toQuery(params: Awaited<SearchParams>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      query.append(key, item);
    }
  }
  return query;
}

export default async function ConsentPage({ searchParams }: { searchParams: SearchParams }) {
  const [query, t, tRoles] = await Promise.all([
    searchParams.then(toQuery),
    getTranslations("consent"),
    getTranslations("common.roles"),
  ]);
  const { secret } = await auth.$context;
  // The authorize endpoint signs this query; anything else is a forged link.
  const valid = query.has("sig") && (await verifyOAuthQueryParams(query.toString(), secret));
  const clientId = query.get("client_id");

  if (!valid || !clientId) {
    return (
      <AuthShell title={t("expiredTitle")}>
        <p className="text-sm text-zinc-600">{t("expiredBody")}</p>
      </AuthShell>
    );
  }

  const context = await getActiveUserOrNull();
  if (!context) {
    redirect(`/login?${query.toString()}`);
  }

  const client = await auth.api
    .getOAuthClientPublic({ headers: await headers(), query: { client_id: clientId } })
    .catch(() => null);
  const clientName = client?.client_name || t("unknownClient");

  return (
    <AuthShell
      subtitle={t.rich("signedInAs", {
        email: (chunks) => <span className="font-medium text-zinc-700">{chunks}</span>,
        emailValue: context.email,
      })}
      title={t("title", { client: clientName })}
    >
      <div className="space-y-5" data-testid="oauth-consent">
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
          <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">
            {t("workspace")}
          </p>
          <p className="mt-1 text-sm font-medium text-zinc-900">{context.org.name}</p>
          <p className="text-xs text-zinc-500">{t("yourRole", { role: tRoles(context.role) })}</p>
        </div>

        <div>
          <p className="text-sm font-medium text-zinc-900">
            {t("willBeAbleTo", { client: clientName })}
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-zinc-600">
            {PERMISSIONS.map((permission) => (
              <li className="flex gap-2" key={permission}>
                <span aria-hidden="true" className="text-zinc-400">
                  ✓
                </span>
                {t(`permissions.${permission}`)}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-zinc-500">{t("actsAsYou")}</p>
        </div>

        <ConsentActions />
      </div>
    </AuthShell>
  );
}
