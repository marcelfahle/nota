"use client";

import { ChevronDown, Download } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buildInvoiceArchiveUrl, type InvoicePeriodKey } from "@/lib/invoice-period";

const ARCHIVE_PERIODS = [
  "last_quarter",
  "this_quarter",
  "year_to_date",
  "all",
] as const satisfies ReadonlyArray<InvoicePeriodKey>;

export function InvoiceArchiveMenu({ status }: { status?: string }) {
  const t = useTranslations("invoices");
  const statusLabel =
    status === "draft" || status === "overdue" || status === "paid"
      ? t(`filters.${status}`)
      : status === "sent"
        ? t("filters.open")
        : null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="min-h-11 sm:min-h-8" size="sm" variant="outline">
          <Download />
          {t("export")}
          <ChevronDown className="ml-0.5 size-3.5 text-zinc-400" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs text-zinc-500">
          {statusLabel
            ? t("archive.statusInvoices", { status: statusLabel })
            : t("archive.allStatuses")}
        </DropdownMenuLabel>
        {ARCHIVE_PERIODS.map((period) => (
          <DropdownMenuItem asChild key={period}>
            <a href={buildInvoiceArchiveUrl({ period, status })}>
              {t(`archive.periods.${period}`)}
              <DropdownMenuShortcut>ZIP</DropdownMenuShortcut>
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
