import Link from "next/link";

export function AuthShell({
  children,
  subtitle,
  title,
}: {
  children: React.ReactNode;
  subtitle?: React.ReactNode;
  title: string;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50">
      <div className="w-full max-w-sm space-y-8 px-4">
        <div className="text-center">
          <Link className="inline-flex items-center gap-3" href="/login">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-zinc-900">
              <span className="text-sm font-semibold text-white">inv</span>
            </div>
            <span className="text-xl font-semibold tracking-tight text-zinc-950">inv.</span>
          </Link>
          <h1 className="mt-6 text-xl font-semibold tracking-tight text-zinc-950">{title}</h1>
          {subtitle ? <div className="mt-2 text-sm text-zinc-500">{subtitle}</div> : null}
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">{children}</div>
      </div>
    </div>
  );
}
