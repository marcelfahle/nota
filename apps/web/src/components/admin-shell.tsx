import Link from "next/link";

import { SignOutButton } from "@/components/sign-out-button";

export function AdminShell({ children, email }: { children: React.ReactNode; email: string }) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b bg-card/40">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-6 px-4 py-4 sm:px-8">
          <div className="flex items-center gap-6">
            <Link className="text-lg font-bold tracking-tight" href="/admin">
              Nota<span className="text-primary">.</span> <span className="font-normal">admin</span>
            </Link>
            <nav aria-label="Administration" className="flex gap-1 text-sm">
              <Link className="rounded-md px-3 py-2 hover:bg-muted" href="/admin">
                Accounts
              </Link>
              <Link className="rounded-md px-3 py-2 hover:bg-muted" href="/admin/ai">
                AI
              </Link>
            </nav>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden truncate font-mono text-xs text-muted-foreground sm:block">
              {email}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1440px] px-4 py-8 sm:px-8">{children}</main>
    </div>
  );
}
