const statusStyles: Record<string, string> = {
  paid: "bg-emerald-50 text-emerald-700",
  sent: "bg-blue-50 text-blue-700",
  draft: "bg-zinc-100 text-zinc-600",
  overdue: "bg-red-50 text-red-700",
  cancelled: "bg-zinc-100 text-zinc-500",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[status] ?? ""}`}
    >
      {status}
    </span>
  );
}
