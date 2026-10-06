import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth-shell";
import { getActiveUserOrNull } from "@/lib/auth";
import { auth } from "@/lib/better-auth";

import { ConsentActions } from "./consent-actions";

const PERMISSIONS = [
  "Read your clients and invoices",
  "Create and edit draft invoices",
  "Send invoices and reminders. This emails your client.",
  "Mark invoices paid, duplicate or cancel them",
];

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
  const query = toQuery(await searchParams);
  const { secret } = await auth.$context;
  // The authorize endpoint signs this query; anything else is a forged link.
  const valid = query.has("sig") && (await verifyOAuthQueryParams(query.toString(), secret));
  const clientId = query.get("client_id");

  if (!valid || !clientId) {
    return (
      <AuthShell title="Link expired">
        <p className="text-sm text-zinc-600">
          This connection request is invalid or has expired. Start again from the app or CLI.
        </p>
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
  const clientName = client?.client_name || "An application";

  return (
    <AuthShell
      subtitle={
        <>
          Signed in as <span className="font-medium text-zinc-700">{context.email}</span>
        </>
      }
      title={`Connect ${clientName} to Nota`}
    >
      <div className="space-y-5" data-testid="oauth-consent">
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
          <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Workspace</p>
          <p className="mt-1 text-sm font-medium text-zinc-900">{context.org.name}</p>
          <p className="text-xs text-zinc-500">Your role: {context.role}</p>
        </div>

        <div>
          <p className="text-sm font-medium text-zinc-900">{clientName} will be able to:</p>
          <ul className="mt-2 space-y-1.5 text-sm text-zinc-600">
            {PERMISSIONS.map((permission) => (
              <li className="flex gap-2" key={permission}>
                <span aria-hidden="true" className="text-zinc-400">
                  ✓
                </span>
                {permission}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-zinc-500">
            It acts with your role in this workspace. Disconnect it any time in Settings.
          </p>
        </div>

        <ConsentActions />
      </div>
    </AuthShell>
  );
}
