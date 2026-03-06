export function StatCard({ label, sub, value }: { label: string; sub?: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium tracking-wide text-zinc-400 uppercase">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
      {sub && <p className="text-xs text-zinc-400">{sub}</p>}
    </div>
  );
}
