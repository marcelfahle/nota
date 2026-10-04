"use client";

import { Menu, Plus, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { ChatPanel } from "@/components/chat-panel";
import {
  StripeDevDock,
  type EmailJobDockItem,
  type EmailJobDockSummary,
  type StripeDockItem,
} from "@/components/stripe-dev-dock";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function readChatOpen(userId: string) {
  try {
    return localStorage.getItem(`nota:chat-open:${userId}`) === "true";
  } catch {
    return false;
  }
}

function writeChatOpen(userId: string, open: boolean) {
  try {
    localStorage.setItem(`nota:chat-open:${userId}`, String(open));
  } catch {
    // Remembering panel state is optional when browser storage is unavailable.
  }
}

export function DashboardShell({
  brandName,
  children,
  domain,
  emailJobItems,
  emailJobSummary,
  logoUrl,
  navCounts,
  stripeDockItems,
  usage,
  userId,
}: {
  brandName: string;
  children: React.ReactNode;
  domain: string | null;
  emailJobItems: Array<EmailJobDockItem>;
  emailJobSummary: EmailJobDockSummary;
  logoUrl: string | null;
  navCounts: { overdue: number; proposals: number };
  stripeDockItems: Array<StripeDockItem>;
  usage: { limit: number | null; plan: string; sent: number };
  userId: string;
}) {
  const navItems = [
    { href: "/home", label: "Home", meta: navCounts.proposals || null },
    {
      href: "/invoices",
      label: "Invoices",
      meta: navCounts.overdue ? `${navCounts.overdue} late` : null,
    },
    { href: "/clients", label: "Clients", meta: null },
  ];
  const pathname = usePathname();
  const isHome = pathname === "/home";
  const isInvoiceList = pathname === "/invoices";
  const [menuOpen, setMenuOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [opsOpen, setOpsOpen] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const chatInput = useRef<HTMLTextAreaElement>(null);

  const focusChat = useCallback(() => {
    if (isHome) {
      window.dispatchEvent(new Event("nota:open-home-chat"));
    } else {
      setPanelOpen(true);
      writeChatOpen(userId, true);
    }
    requestAnimationFrame(() => chatInput.current?.focus());
  }, [isHome, userId]);

  useEffect(() => {
    setPanelOpen(readChatOpen(userId));
  }, [userId]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "j") {
        event.preventDefault();
        focusChat();
      }
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusChat]);

  function setChatOpen(open: boolean) {
    setPanelOpen(open);
    writeChatOpen(userId, open);
  }

  const chatOpen = panelOpen;

  return (
    <div className="app-shell min-h-dvh bg-background text-foreground md:grid md:grid-cols-[248px_minmax(0,1fr)]">
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-card focus:p-3"
        href="#main-content"
      >
        Skip to content
      </a>
      <aside className="border-b bg-sidebar md:sticky md:top-0 md:h-dvh md:overflow-y-auto md:border-r md:border-b-0">
        <div className="flex h-full flex-col gap-5 p-4">
          <div className="flex items-center justify-between gap-2">
            <Link className="flex min-w-0 items-center gap-3 px-2 py-1" href="/home">
              {logoUrl && !imageFailed ? (
                <img
                  alt=""
                  className="size-8 rounded-md object-cover"
                  onError={() => setImageFailed(true)}
                  src={logoUrl}
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground"
                >
                  {brandName.slice(0, 1)}
                </span>
              )}
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{brandName}</span>
                {domain ? (
                  <span className="block truncate font-mono text-[11px] text-muted-foreground">
                    {domain}
                  </span>
                ) : null}
              </span>
            </Link>
            <Button
              aria-controls="workspace-navigation"
              aria-expanded={menuOpen}
              aria-label={menuOpen ? "Close navigation" : "Open navigation"}
              className="md:hidden"
              onClick={() => setMenuOpen(!menuOpen)}
              size="icon"
              variant="ghost"
            >
              {menuOpen ? <X /> : <Menu />}
            </Button>
          </div>
          <div
            className={cn("flex-1 flex-col gap-5", menuOpen ? "flex" : "hidden md:flex")}
            id="workspace-navigation"
          >
            <button
              className="flex min-h-10 items-center justify-between rounded-md border bg-card px-3 text-left text-sm text-muted-foreground"
              onClick={() => setMenuOpen(false)}
              type="button"
            >
              Search <kbd className="font-mono text-[11px]">⌘K</kbd>
            </button>
            <nav
              aria-label="Main"
              className="flex flex-col gap-1"
              onClick={() => setMenuOpen(false)}
            >
              {navItems.map(({ href, label, meta }) => (
                <Link
                  aria-current={pathname.startsWith(href) ? "page" : undefined}
                  className={cn(
                    "rounded-md border border-transparent px-3 py-2.5 text-sm hover:bg-card",
                    pathname.startsWith(href) && "border-border bg-card font-semibold",
                  )}
                  href={href}
                  key={href}
                >
                  <span className="flex items-center justify-between gap-2">
                    {label}
                    {meta ? (
                      <span
                        className={cn(
                          "font-mono text-[11px] font-normal",
                          href === "/invoices" ? "text-destructive" : "text-muted-foreground",
                        )}
                      >
                        {meta}
                      </span>
                    ) : null}
                  </span>
                </Link>
              ))}
            </nav>
            <nav
              aria-label="Workspace"
              className="mt-auto flex flex-col gap-1"
              onClick={() => setMenuOpen(false)}
            >
              <Link
                aria-current={pathname === "/agents" ? "page" : undefined}
                className={cn(
                  "rounded-md border border-transparent px-3 py-2.5 text-sm hover:bg-card",
                  pathname === "/agents" && "border-border bg-card font-semibold",
                )}
                href="/agents"
              >
                Connect an agent
              </Link>
              <Link
                aria-current={pathname === "/settings" ? "page" : undefined}
                className={cn(
                  "rounded-md border border-transparent px-3 py-2.5 text-sm hover:bg-card",
                  pathname === "/settings" && "border-border bg-card font-semibold",
                )}
                href="/settings"
              >
                Settings
              </Link>
            </nav>
            <div className="space-y-2 rounded-md border border-dashed p-3">
              <div className="flex justify-between gap-2">
                <span className="nota-label">
                  {usage.limit === null
                    ? usage.plan === "pro"
                      ? "Pro plan"
                      : "Self-hosted"
                    : "Free plan"}
                </span>
                <span className="font-mono text-[11px]">
                  {usage.sent}
                  {usage.limit !== null ? ` / ${usage.limit}` : " sent"}
                </span>
              </div>
              {usage.limit !== null ? (
                <meter
                  aria-label="Invoices sent this month"
                  className="block h-2 w-full accent-foreground"
                  max={usage.limit}
                  min={0}
                  value={Math.min(usage.sent, usage.limit)}
                />
              ) : null}
              <Link className="text-xs underline underline-offset-4" href="/settings">
                {usage.limit !== null ? "View plans and usage" : "Manage billing"}
              </Link>
            </div>
            <div className="flex items-center justify-between px-2">
              <span className="text-xl font-bold tracking-tight">
                Nota<span className="text-primary">.</span>
              </span>
              <button
                className="text-xs text-muted-foreground"
                onClick={() => setOpsOpen(!opsOpen)}
                type="button"
              >
                {opsOpen ? "Hide" : "Show"} ops
              </button>
            </div>
          </div>
        </div>
      </aside>
      <div className={cn("min-w-0", !isHome && chatOpen && "xl:pr-[340px]")}>
        <div
          className={cn(
            "justify-end px-4 pt-5 sm:px-8",
            isHome || isInvoiceList ? "hidden" : "flex",
          )}
        >
          <Button asChild size="sm">
            <Link href="/invoices/new">
              <Plus />
              New Invoice
            </Link>
          </Button>
        </div>
        <main
          className={cn(
            "mx-auto max-w-6xl px-4 pb-20 sm:px-8 sm:pb-20",
            isHome ? "py-12 sm:py-[72px]" : "py-6 sm:py-8",
          )}
          id="main-content"
          tabIndex={-1}
        >
          {children}
          {isHome ? null : (
            <ChatPanel
              inputRef={chatInput}
              mode="panel"
              onOpenChange={setChatOpen}
              open={chatOpen}
            />
          )}
        </main>
      </div>
      {opsOpen ? (
        <StripeDevDock items={stripeDockItems} jobs={emailJobItems} jobSummary={emailJobSummary} />
      ) : null}
    </div>
  );
}
