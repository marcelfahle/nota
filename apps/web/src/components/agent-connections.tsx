"use client";

import { Check, CheckIcon, Copy, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useTransition, type ReactNode } from "react";

import { disconnectAppAction } from "@/actions/connected-apps";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MCP_URL = "https://mcp.withnota.com/mcp";
const CLAUDE_URL = "https://claude.ai/customize/connectors?modal=add-custom-connector";
const CHATGPT_URL = "https://chatgpt.com/plugins";

type ConnectedApp = {
  clientId: string;
  connectedAt: string;
  lastUsedAt: string;
  name: string | null;
};

const tabs = ["claude", "chatgpt", "terminal"] as const;
type Tab = (typeof tabs)[number];

function CopyButton({ label = "Copy", value }: { label?: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      className="inline-flex min-h-7 shrink-0 items-center gap-1.5 rounded border border-white/30 px-2.5 text-xs font-semibold text-[#e8e4dc] hover:bg-white/10"
      onClick={() => void copy()}
      type="button"
    >
      {copied ? <CheckIcon aria-hidden="true" /> : <Copy aria-hidden="true" />}
      {copied ? "Copied" : label}
    </button>
  );
}

function Code({ children, copy }: { children: ReactNode; copy?: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded bg-[#181512] px-3 py-2.5 font-mono text-xs text-[#e8e4dc]">
      <code className="min-w-0 flex-1 break-all whitespace-pre-wrap sm:break-normal sm:whitespace-pre">
        {children}
      </code>
      {copy ? <CopyButton value={copy} /> : null}
    </div>
  );
}

function Step({
  children,
  complete,
  number,
}: {
  children: ReactNode;
  complete?: boolean;
  number: number;
}) {
  return (
    <li className="flex gap-4 pb-6">
      <span
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-full border border-foreground font-mono text-xs font-semibold",
          complete && "border-highlighter bg-highlighter text-[#1f1b16]",
        )}
      >
        {complete ? <Check aria-hidden="true" className="size-4" /> : number}
        {complete ? <span className="sr-only">Complete</span> : null}
      </span>
      <div className="min-w-0 flex-1 space-y-2">{children}</div>
    </li>
  );
}

function provider(app: ConnectedApp) {
  const name = app.name?.toLowerCase() ?? "";
  if (name.includes("claude") || name.includes("anthropic")) {
    return "claude";
  }
  if (name.includes("chatgpt") || name.includes("openai")) {
    return "chatgpt";
  }
  return null;
}

function formatConnected(value: string) {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(value),
  );
}

function formatLastUsed(app: ConnectedApp) {
  const connectedAt = new Date(app.connectedAt).getTime();
  const lastUsedAt = new Date(app.lastUsedAt).getTime();
  if (lastUsedAt - connectedAt < 1000) {
    return "not used yet";
  }

  return `last used ${new Intl.DateTimeFormat("en", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(lastUsedAt)}`;
}

function ConnectionStatus({ app, onRemoved }: { app?: ConnectedApp; onRemoved: () => void }) {
  const [pending, startTransition] = useTransition();

  if (!app) {
    return (
      <div className="flex items-center gap-2 border-t py-4 font-mono text-xs text-muted-foreground">
        <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-foreground" />
        Waiting for a connection. This page updates itself when one appears.
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t py-3.5">
      <p className="font-mono text-xs">
        Connected {formatConnected(app.connectedAt)} · {formatLastUsed(app)}
      </p>
      <Button
        className="border-destructive text-destructive hover:bg-destructive/10"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await disconnectAppAction(app.clientId);
            onRemoved();
          })
        }
        size="sm"
        variant="outline"
      >
        Remove access
      </Button>
    </div>
  );
}

function ExamplesAndPermissions() {
  const prompts = [
    "Invoice Oxide for 40 hours in September and send it.",
    "Who still owes me money, and for how long?",
    "Halden paid half by transfer. Record it and send a receipt.",
  ];
  const permissions = [
    ["Read invoices, clients and VAT", "allowed"],
    ["Draft invoices and quotes", "allowed"],
    ["Send to a client", "asks first"],
    ["Record payments", "allowed"],
    ["Delete records", "never"],
  ];

  return (
    <aside className="space-y-7">
      <section aria-labelledby="agent-examples">
        <h2 className="nota-label border-b pb-2.5 text-foreground" id="agent-examples">
          Then just say
        </h2>
        {prompts.map((prompt) => (
          <p className="border-b py-3 font-voice text-lg leading-snug italic" key={prompt}>
            “{prompt}”
          </p>
        ))}
      </section>
      <section aria-labelledby="agent-permissions">
        <h2 className="nota-label border-b pb-2.5 text-foreground" id="agent-permissions">
          What an agent may do
        </h2>
        <dl>
          {permissions.map(([action, access]) => (
            <div className="flex justify-between gap-3 border-b py-2.5" key={action}>
              <dt>{action}</dt>
              <dd
                className={cn(
                  "shrink-0 font-mono text-xs",
                  access === "never" && "text-destructive",
                )}
              >
                {access}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </aside>
  );
}

export function AgentConnections({ initialApps }: { initialApps: Array<ConnectedApp> }) {
  const [activeTab, setActiveTab] = useState<Tab>("claude");
  const [apps, setApps] = useState(initialApps);
  const claude = apps.find((app) => provider(app) === "claude");
  const chatgpt = apps.find((app) => provider(app) === "chatgpt");

  useEffect(() => {
    const controller = new AbortController();
    async function refresh() {
      try {
        const response = await fetch("/api/connected-apps", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.ok) {
          const payload = (await response.json()) as { apps: Array<ConnectedApp> };
          setApps(payload.apps);
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          // Polling is best effort; the next interval retries.
        }
      }
    }

    const interval = window.setInterval(() => void refresh(), 5000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, []);

  function remove(clientId: string) {
    setApps((current) => current.filter((app) => app.clientId !== clientId));
  }

  return (
    <div className="space-y-7">
      <header className="space-y-3.5">
        <p className="nota-label">
          Agents <span className="opacity-40">/</span> {apps.length} connected
        </p>
        <h1>
          Run Nota from <span className="highlighter-swipe">Claude</span>
          {" or "}
          <span className="highlighter-swipe">ChatGPT.</span>
        </h1>
        <p className="max-w-[38em] font-voice text-xl leading-relaxed">
          Draft, send, chase and check what you are owed from the chat you already use. It signs in
          as you, and you can take its access away here at any time.
        </p>
      </header>

      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(240px,2fr)]">
        <section className="min-w-0 rounded-lg border px-4 pt-4 sm:px-6">
          <div
            aria-label="Choose an assistant"
            className="mb-6 grid w-full grid-cols-3 gap-1 rounded-lg bg-muted p-1"
            role="tablist"
          >
            {tabs.map((tab) => (
              <button
                aria-controls={`agent-panel-${tab}`}
                aria-selected={activeTab === tab}
                className={cn(
                  "min-h-10 rounded-md border border-transparent px-2 text-sm font-semibold text-muted-foreground",
                  activeTab === tab && "border-foreground bg-card text-foreground",
                )}
                id={`agent-tab-${tab}`}
                key={tab}
                onClick={() => setActiveTab(tab)}
                onKeyDown={(event) => {
                  const current = tabs.indexOf(tab);
                  const next =
                    event.key === "ArrowRight"
                      ? tabs[(current + 1) % tabs.length]
                      : event.key === "ArrowLeft"
                        ? tabs[(current - 1 + tabs.length) % tabs.length]
                        : event.key === "Home"
                          ? tabs[0]
                          : event.key === "End"
                            ? tabs.at(-1)
                            : null;
                  if (next) {
                    event.preventDefault();
                    setActiveTab(next);
                    document.getElementById(`agent-tab-${next}`)?.focus();
                  }
                }}
                role="tab"
                tabIndex={activeTab === tab ? 0 : -1}
                type="button"
              >
                {tab === "chatgpt" ? "ChatGPT" : `${tab.slice(0, 1).toUpperCase()}${tab.slice(1)}`}
              </button>
            ))}
          </div>

          <div
            aria-labelledby="agent-tab-claude"
            hidden={activeTab !== "claude"}
            id="agent-panel-claude"
            role="tabpanel"
          >
            <ol>
              <Step complete={Boolean(claude)} number={1}>
                <h2 className="font-semibold">Add Nota to Claude</h2>
                <p className="text-muted-foreground">
                  Copy Nota’s server address, open Claude’s custom connector form, and paste it with
                  the name Nota.
                </p>
                <Code copy={MCP_URL}>{MCP_URL}</Code>
                <Button asChild variant="outline">
                  <a href={CLAUDE_URL} rel="noreferrer" target="_blank">
                    Open Claude <ExternalLink aria-hidden="true" />
                  </a>
                </Button>
              </Step>
              <Step complete={Boolean(claude)} number={2}>
                <h2 className="font-semibold">Sign in when Claude asks</h2>
                <p className="text-muted-foreground">
                  Use your Nota account. Nothing else to copy and no API key to share.
                </p>
              </Step>
            </ol>
            <ConnectionStatus app={claude} onRemoved={() => claude && remove(claude.clientId)} />
            <details className="border-t py-3.5">
              <summary className="min-h-7 cursor-pointer font-semibold">
                Using Claude Code or Claude Desktop?
              </summary>
              <div className="mt-2.5">
                <Code copy={`claude mcp add --transport http nota ${MCP_URL}`}>
                  claude mcp add --transport http nota {MCP_URL}
                </Code>
              </div>
            </details>
          </div>

          <div
            aria-labelledby="agent-tab-chatgpt"
            hidden={activeTab !== "chatgpt"}
            id="agent-panel-chatgpt"
            role="tabpanel"
          >
            <ol>
              <Step complete={Boolean(chatgpt)} number={1}>
                <h2 className="font-semibold">Turn on Developer mode in ChatGPT</h2>
                <p className="text-muted-foreground">
                  Open Settings → Security and login, then turn on Developer mode.
                </p>
              </Step>
              <Step complete={Boolean(chatgpt)} number={2}>
                <h2 className="font-semibold">Create an app with this address</h2>
                <p className="text-muted-foreground">
                  Name it Nota, use OAuth, and enter Nota’s MCP server URL.
                </p>
                <Code copy={MCP_URL}>{MCP_URL}</Code>
                <Button asChild variant="outline">
                  <a href={CHATGPT_URL} rel="noreferrer" target="_blank">
                    Open ChatGPT plugins <ExternalLink aria-hidden="true" />
                  </a>
                </Button>
              </Step>
              <Step complete={Boolean(chatgpt)} number={3}>
                <h2 className="font-semibold">Sign in when ChatGPT asks</h2>
                <p className="text-muted-foreground">Use your Nota account.</p>
              </Step>
            </ol>
            <ConnectionStatus app={chatgpt} onRemoved={() => chatgpt && remove(chatgpt.clientId)} />
          </div>

          <div
            aria-labelledby="agent-tab-terminal"
            hidden={activeTab !== "terminal"}
            id="agent-panel-terminal"
            role="tabpanel"
          >
            <ol>
              <Step number={1}>
                <h2 className="font-semibold">Install the CLI from source</h2>
                <p className="text-muted-foreground">
                  The package is not published yet. Build the current CLI from the Nota repository.
                </p>
                <Code>{`git clone https://github.com/marcelfahle/nota.git\ncd nota && bun install && bun run build:cli\ncd apps/cli && bun link`}</Code>
              </Step>
              <Step number={2}>
                <h2 className="font-semibold">Sign in, then bill someone</h2>
                <p className="text-muted-foreground">
                  Create an API key in Settings, then enter it privately when the CLI asks.
                </p>
                <Code>{`$ nota login\n$ nota invoices create --client oxide --item "Consulting, 40h @ 120"`}</Code>
              </Step>
            </ol>
            <p className="border-t py-4 text-muted-foreground">
              Building something? The REST API also uses keys from{" "}
              <Link className="text-foreground underline underline-offset-4" href="/settings#api">
                Settings
              </Link>
              .
            </p>
          </div>
        </section>

        <ExamplesAndPermissions />
      </div>
    </div>
  );
}
