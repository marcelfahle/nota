function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-zinc-100 ${className ?? ""}`} />;
}

export default function ClientsLoading() {
  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-8 w-28 rounded-md" />
      </div>

      <div className="divide-y divide-zinc-100">
        {Array.from({ length: 5 }).map((_, i) => (
          <div className="flex items-center justify-between py-4" key={i}>
            <div className="flex items-center gap-4">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div>
                <Skeleton className="mb-1 h-4 w-32" />
                <Skeleton className="h-3 w-44" />
              </div>
            </div>
            <div className="text-right">
              <Skeleton className="mb-1 ml-auto h-4 w-20" />
              <Skeleton className="ml-auto h-3 w-16" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
