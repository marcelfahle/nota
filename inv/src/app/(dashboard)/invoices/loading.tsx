function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-zinc-100 ${className ?? ""}`} />;
}

export default function InvoicesLoading() {
  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <Skeleton className="h-6 w-24" />
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-3 gap-8">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i}>
            <Skeleton className="mb-2 h-3 w-20" />
            <Skeleton className="h-8 w-28" />
          </div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div className="mb-6 flex gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton className="h-8 w-16 rounded-md" key={i} />
        ))}
      </div>

      {/* Table Header */}
      <div className="border-b border-zinc-100 pb-3">
        <div className="flex gap-4">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="ml-auto h-3 w-16" />
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-3 w-14" />
        </div>
      </div>

      {/* Table Rows */}
      <div className="divide-y divide-zinc-50">
        {Array.from({ length: 5 }).map((_, i) => (
          <div className="flex items-center gap-4 py-3" key={i}>
            <Skeleton className="h-4 w-20" />
            <div>
              <Skeleton className="mb-1 h-4 w-28" />
              <Skeleton className="h-3 w-36" />
            </div>
            <Skeleton className="ml-auto h-4 w-20" />
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
