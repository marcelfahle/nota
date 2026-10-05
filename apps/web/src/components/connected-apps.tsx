"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { disconnectAppAction } from "@/actions/connected-apps";
import { Button } from "@/components/ui/button";

export function ConnectedApps({
  connections,
}: {
  connections: Array<{ clientId: string; name: string | null }>;
}) {
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
      setError("Could not disconnect this app. Please try again.");
    } finally {
      setPending(null);
    }
  }
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Connected apps</h2>
        <p className="text-sm text-muted-foreground">
          Manage the CLI and assistants authorized to use your Nota account.
        </p>
      </div>
      {connections.length ? (
        connections.map((app) => (
          <div className="flex items-center justify-between gap-4 border-b py-3" key={app.clientId}>
            <span className="text-sm font-medium">{app.name || "Connected app"}</span>
            <Button
              disabled={pending !== null}
              onClick={() => disconnect(app.clientId)}
              variant="outline"
            >
              {pending === app.clientId ? "Disconnecting…" : "Disconnect"}
            </Button>
          </div>
        ))
      ) : (
        <p className="text-sm text-muted-foreground">No apps connected yet.</p>
      )}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
