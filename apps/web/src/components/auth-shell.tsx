import { AuthPlayground } from "@/components/auth-playground";
import { NotaGlyph } from "@/components/nota-marks";
import { HOME_URL } from "@/lib/app-brand";

/**
 * Sign in, register and password pages: the form on paper to the left, the
 * playground on ink to the right. On a phone the form stands alone.
 */
export function AuthShell({
  children,
  lead,
  subtitle,
  title,
}: {
  children: React.ReactNode;
  /** One line in the reading voice under the title. */
  lead?: React.ReactNode;
  subtitle?: React.ReactNode;
  title: React.ReactNode;
}) {
  return (
    <div
      className="auth-shell grid min-h-dvh bg-background pt-[env(safe-area-inset-top)] text-foreground lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]"
      data-theme="system"
    >
      <div className="flex min-h-dvh flex-col px-5 py-5 sm:px-10 lg:min-h-0">
        <header className="flex items-center justify-between gap-4">
          <a aria-label="Nota home" className="flex items-center gap-2" href={HOME_URL}>
            <NotaGlyph />
            <span className="text-lg font-bold tracking-tight">Nota.</span>
          </a>
          {subtitle ? <div className="text-sm text-muted-foreground">{subtitle}</div> : null}
        </header>

        <main className="mx-auto flex w-full max-w-[24rem] flex-1 flex-col justify-center py-12">
          <h1 className="onboarding-title">{title}</h1>
          {lead ? <p className="mt-4 font-voice text-xl text-muted-foreground">{lead}</p> : null}
          <div className="mt-9">{children}</div>
        </main>

        <p className="text-xs text-muted-foreground">Minimal invoicing for independent work.</p>
      </div>

      <div className="hidden lg:block lg:p-3 lg:pl-0">
        <div className="sticky top-3 h-[calc(100dvh-1.5rem)] overflow-hidden rounded-xl">
          <AuthPlayground />
        </div>
      </div>
    </div>
  );
}
