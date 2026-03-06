"use client";

import { Plus, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import {
  StripeDevDock,
  type EmailJobDockItem,
  type EmailJobDockSummary,
  type StripeDockItem,
} from "@/components/stripe-dev-dock";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/invoices", label: "Invoices" },
  { href: "/clients", label: "Clients" },
];

function BrandMark({ brandName, logoUrl }: { brandName: string; logoUrl: string | null }) {
  const [imageFailed, setImageFailed] = useState(false);

  if (logoUrl && !imageFailed) {
    return (
      <img
        alt={brandName}
        className="h-8 w-8 rounded-md border border-zinc-200 bg-white object-cover"
        onError={() => setImageFailed(true)}
        src={logoUrl}
      />
    );
  }

  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-900">
      <span className="text-[10px] font-semibold text-white">inv</span>
    </div>
  );
}

export function DashboardShell({
  brandName,
  children,
  emailJobItems,
  emailJobSummary,
  logoUrl,
  stripeDockItems,
}: {
  brandName: string;
  children: React.ReactNode;
  emailJobItems: Array<EmailJobDockItem>;
  emailJobSummary: EmailJobDockSummary;
  logoUrl: string | null;
  stripeDockItems: Array<StripeDockItem>;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-zinc-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-4 sm:gap-8">
            <Link className="flex items-center gap-2" href="/invoices">
              <BrandMark brandName={brandName} logoUrl={logoUrl} />
              <div className="min-w-0">
                <span className="block truncate text-sm font-semibold tracking-tight text-zinc-900">
                  {brandName}
                </span>
                <span className="hidden text-[10px] tracking-[0.22em] text-zinc-400 uppercase sm:block">
                  Internal billing
                </span>
              </div>
            </Link>

            <nav className="flex items-center gap-1">
              {navItems.map((item) => (
                <Link
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    pathname.startsWith(item.href)
                      ? "bg-zinc-100 text-zinc-900"
                      : "text-zinc-500 hover:text-zinc-900",
                  )}
                  href={item.href}
                  key={item.href}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <Button asChild size="sm">
              <Link href="/invoices/new">
                <Plus />
                <span className="hidden sm:inline">New Invoice</span>
              </Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href="/settings">
                <Settings className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 pb-28 sm:px-6 sm:py-8 sm:pb-32">{children}</main>
      <StripeDevDock items={stripeDockItems} jobs={emailJobItems} jobSummary={emailJobSummary} />
    </div>
  );
}
