"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { disconnectAppAction } from "@/actions/connected-apps";
import { Button } from "@/components/ui/button";

export function ConnectedApps({
  connections,
}: {
  connections: Array<{ clientId: string; name: string | null }>;
}) {
  const t = useTranslations("settings.connectedApps");
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function disconnect(id: string) {
    setPending(id);
    setError(null);
    try {
      await disconnectAppAction(id);
      router.refresh();
    } catch {
      setError(t("error"));
    } finally {
      setPending(null);
    }
  }
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t("heading")}</h2>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      {connections.length ? (
        connections.map((app) => (
          <div className="flex items-center justify-between gap-4 border-b py-3" key={app.clientId}>
            <span className="text-sm font-medium">{app.name || t("unnamed")}</span>
            <Button
              disabled={pending !== null}
              onClick={() => disconnect(app.clientId)}
              variant="outline"
            >
              {pending === app.clientId ? t("disconnecting") : t("disconnect")}
            </Button>
          </div>
        ))
      ) : (
        <p className="text-sm text-muted-foreground">{t("none")}</p>
      )}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
