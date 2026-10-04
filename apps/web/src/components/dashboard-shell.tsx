"use client";

import { Menu, Plus, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ChatPanel } from "@/components/chat-panel";
import {
  StripeDevDock,
  type EmailJobDockItem,
  type EmailJobDockSummary,
  type StripeDockItem,
} from "@/components/stripe-dev-dock";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/home", label: "Home" },
  { href: "/invoices", label: "Invoices" },
  { href: "/clients", label: "Clients" },
];

export function DashboardShell({
  brandName,
  children,
  domain,
  emailJobItems,
  emailJobSummary,
  logoUrl,
  stripeDockItems,
  usage,
}: {
  brandName: string;
  children: React.ReactNode;
  domain: string | null;
  emailJobItems: Array<EmailJobDockItem>;
  emailJobSummary: EmailJobDockSummary;
  logoUrl: string | null;
  stripeDockItems: Array<StripeDockItem>;
  usage: { limit: number | null; plan: string; sent: number };
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [opsOpen, setOpsOpen] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const chatInput = useRef<HTMLTextAreaElement>(null);

  function focusChat() {
    if (chatInput.current) {
      chatInput.current.focus();
    } else {
      setChatOpen(true);
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        focusChat();
      }
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
              onClick={() => {
                setMenuOpen(false);
                focusChat();
              }}
              type="button"
            >
              Ask or search <kbd className="font-mono text-[11px]">⌘K</kbd>
            </button>
            <nav
              aria-label="Main"
              className="flex flex-col gap-1"
              onClick={() => setMenuOpen(false)}
            >
              {navItems.map(({ href, label }) => (
                <Link
                  aria-current={pathname.startsWith(href) ? "page" : undefined}
                  className={cn(
                    "rounded-md border border-transparent px-3 py-2.5 text-sm hover:bg-card",
                    pathname.startsWith(href) && "border-border bg-card font-semibold",
                  )}
                  href={href}
                  key={href}
                >
                  {label}
                </Link>
              ))}
            </nav>
            <nav
              aria-label="Workspace"
              className="mt-auto flex flex-col gap-1"
              onClick={() => setMenuOpen(false)}
            >
              <Link
                className="rounded-md px-3 py-2.5 text-sm hover:bg-card"
                href="/settings#connected-apps"
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
      <div className={cn("min-w-0", chatOpen && "xl:pr-[400px]")}>
        <div className="flex justify-end px-4 pt-5 sm:px-8">
          <Button asChild size="sm">
            <Link href="/invoices/new">
              <Plus />
              New Invoice
            </Link>
          </Button>
        </div>
        <main
          className="mx-auto max-w-6xl px-4 py-6 pb-56 sm:px-8 sm:py-8 sm:pb-56"
          id="main-content"
          tabIndex={-1}
        >
          {children}
        </main>
        <ChatPanel inputRef={chatInput} onOpenChange={setChatOpen} open={chatOpen} />
      </div>
      {opsOpen ? (
        <StripeDevDock items={stripeDockItems} jobs={emailJobItems} jobSummary={emailJobSummary} />
      ) : null}
    </div>
  );
}
