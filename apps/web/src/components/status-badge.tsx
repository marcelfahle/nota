const statusStyles: Record<string, string> = {
  cancelled: "text-muted-foreground",
  draft: "border-dashed text-muted-foreground",
  opened: "text-foreground",
  overdue: "border-transparent bg-destructive text-background",
  paid: "border-transparent bg-highlighter text-[#1f1b16]",
  part_paid: "text-foreground shadow-[inset_3px_0_0_#d1fd39]",
  sent: "text-foreground",
};

const labels: Record<string, string> = {
  cancelled: "Cancelled",
  draft: "Draft",
  opened: "Opened",
  overdue: "Overdue",
  paid: "Paid",
  part_paid: "Part paid",
  sent: "Sent",
};

export function StatusBadge({ openCount, status }: { openCount?: number; status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-sm border px-2 py-0.5 font-mono text-[11px] font-medium whitespace-nowrap ${statusStyles[status] ?? ""}`}
    >
      {labels[status] ?? status}
      {status === "opened" && openCount !== undefined ? ` ${openCount}×` : ""}
    </span>
  );
}
