"use client";

import { ChevronDown, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  buildInvoiceArchiveUrl,
  type InvoicePeriodKey,
} from "@/lib/invoice-period";

const ARCHIVE_PERIODS: Array<{ key: InvoicePeriodKey; label: string }> = [
  { key: "last_quarter", label: "Last quarter" },
  { key: "this_quarter", label: "This quarter" },
  { key: "year_to_date", label: "Year to date" },
  { key: "all", label: "All invoices" },
];

export function InvoiceArchiveMenu({ status }: { status?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="min-h-11 sm:min-h-8" size="sm" variant="outline">
          <Download />
          Download PDFs
          <ChevronDown className="ml-0.5 size-3.5 text-zinc-400" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs text-zinc-500">
          {status
            ? `${status[0].toUpperCase()}${status.slice(1)} invoices`
            : "All statuses"}
        </DropdownMenuLabel>
        {ARCHIVE_PERIODS.map((period) => (
          <DropdownMenuItem asChild key={period.key}>
            <a href={buildInvoiceArchiveUrl({ period: period.key, status })}>
              {period.label}
              <DropdownMenuShortcut>ZIP</DropdownMenuShortcut>
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
