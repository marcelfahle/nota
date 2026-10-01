"use client";

import { Plug } from "lucide-react";
import { useTransition } from "react";

import { disconnectAppAction } from "@/actions/connected-apps";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export type ConnectedApp = {
  clientId: string;
  connectedAt: Date;
  name: string | null;
};

const formatDate = (value: Date) =>
  new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(value);

export function ConnectedAppsSettings({ apps }: { apps: Array<ConnectedApp> }) {
  const [pending, startTransition] = useTransition();

  return (
    <Card data-testid="connected-apps">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plug className="h-4 w-4" /> Connected apps
        </CardTitle>
        <CardDescription>
          Assistants like ChatGPT and Claude that can use Nota on your behalf.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {apps.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Nothing connected yet. Add Nota as a connector in ChatGPT or Claude to see it here.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {apps.map((app) => (
              <li className="flex items-center justify-between gap-4 py-3" key={app.clientId}>
                <div>
                  <p className="text-sm font-medium text-zinc-900">{app.name ?? "Unnamed app"}</p>
                  <p className="text-xs text-zinc-500">Connected {formatDate(app.connectedAt)}</p>
                </div>
                <Button
                  disabled={pending}
                  onClick={() => startTransition(() => void disconnectAppAction(app.clientId))}
                  size="sm"
                  variant="outline"
                >
                  Disconnect
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
