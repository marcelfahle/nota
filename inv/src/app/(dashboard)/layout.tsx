"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Invoices", href: "/invoices" },
  { label: "Clients", href: "/clients" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-100">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-8">
            <Link href="/invoices" className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-900">
                <span className="text-[10px] font-semibold text-white">
                  inv
                </span>
              </div>
              <span className="text-sm font-semibold tracking-tight">
                inv.
              </span>
            </Link>

            <nav className="flex items-center gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    pathname.startsWith(item.href)
                      ? "bg-zinc-100 text-zinc-900"
                      : "text-zinc-500 hover:text-zinc-900"
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <Button asChild size="sm">
            <Link href="/invoices/new">
              <Plus />
              New Invoice
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
