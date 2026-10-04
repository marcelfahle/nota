// Shown the instant a sidebar link is clicked, while the page's data loads.
export default function DashboardLoading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-8" role="status">
      <div className="h-10 w-64 max-w-full animate-pulse rounded bg-secondary" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <div className="h-12 animate-pulse rounded bg-secondary/70" key={index} />
        ))}
      </div>
    </div>
  );
}
