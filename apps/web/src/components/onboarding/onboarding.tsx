"use client";

import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";

import { HalftoneShadow, HighlighterSwipe, NotaGlyph } from "@/components/nota-marks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { continueAfterAuth } from "@/lib/auth-redirect";
import type { SiteProfile } from "@/lib/site-reader/types";
import { cn } from "@/lib/utils";

import { InvoicePreview } from "./invoice-preview";
import { Meet } from "./meet";
import { useSiteRead } from "./use-site-read";

type Step = "ask" | "meet" | "save";

const TRAIL: Array<{ id: Step; label: string }> = [
  { id: "ask", label: "Your website" },
  { id: "meet", label: "Your invoice" },
  { id: "save", label: "Your account" },
];

/** Morphs the invoice between screens where the browser can; otherwise just switches. */
function transition(update: () => void) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduced && "startViewTransition" in document) {
    document.startViewTransition(() => flushSync(update));
  } else {
    update();
  }
}

function Trail({ step }: { step: Step }) {
  const index = TRAIL.findIndex((entry) => entry.id === step);
  return (
    <ol aria-label="Progress" className="hidden items-center gap-2.5 sm:flex">
      {TRAIL.map((entry, position) => (
        <li className="flex items-center gap-2.5" key={entry.id}>
          {position > 0 ? <span aria-hidden="true" className="h-px w-5 bg-border" /> : null}
          <span
            aria-current={position === index ? "step" : undefined}
            className={cn(
              "nota-label flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors",
              position === index
                ? "bg-primary text-primary-foreground"
                : position < index
                  ? "text-foreground"
                  : "text-muted-foreground",
            )}
          >
            {position < index ? <Check aria-hidden="true" className="size-3" /> : null}
            {entry.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

function SaveForm({ onBack, settle }: { onBack: () => void; settle: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    // The profile must be in the session before the account is created from it.
    await settle();
    const { data, error: signUpError } = await authClient.signUp.email({
      email: String(form.get("email") ?? "")
        .trim()
        .toLowerCase(),
      name: String(form.get("name") ?? "").trim(),
      password: String(form.get("password") ?? ""),
    });
    if (signUpError) {
      setPending(false);
      setError(
        signUpError.code === "USER_ALREADY_EXISTS" ||
          signUpError.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"
          ? "An account already exists for that email. Sign in instead."
          : signUpError.code === "PASSWORD_TOO_SHORT"
            ? "Password must be at least 8 characters."
            : (signUpError.message ?? "Could not create your account."),
      );
      return;
    }
    continueAfterAuth(data);
  }

  const input = "h-12 bg-card px-3.5 md:text-base";

  return (
    <form className="space-y-4" data-testid="onboarding-save-form" onSubmit={onSubmit}>
      <div className="space-y-1.5">
        <Label htmlFor="onboarding-name">Your name</Label>
        <Input
          autoComplete="name"
          autoFocus
          className={input}
          data-testid="onboarding-name"
          id="onboarding-name"
          name="name"
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="onboarding-email">Email</Label>
        <Input
          autoComplete="email"
          className={input}
          data-testid="onboarding-email"
          id="onboarding-email"
          name="email"
          required
          type="email"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="onboarding-password">Password</Label>
        <Input
          autoComplete="new-password"
          className={input}
          data-testid="onboarding-password"
          id="onboarding-password"
          minLength={8}
          name="password"
          placeholder="At least 8 characters"
          required
          type="password"
        />
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Button
        className="h-12 w-full text-base font-semibold"
        data-testid="onboarding-save-submit"
        disabled={pending}
        type="submit"
      >
        {pending ? "Saving your invoice…" : "Create my account"}
      </Button>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <button
          className="inline-flex min-h-11 items-center gap-1.5 hover:text-foreground"
          onClick={onBack}
          type="button"
        >
          <ArrowLeft aria-hidden="true" className="size-4" /> Back
        </button>
        <span>
          Already with Nota?{" "}
          <Link className="font-medium text-foreground underline underline-offset-4" href="/login">
            Sign in
          </Link>
        </span>
      </div>
    </form>
  );
}

export function Onboarding({ initialProfile }: { initialProfile: SiteProfile | null }) {
  const read = useSiteRead(initialProfile);
  const [step, setStep] = useState<Step>(initialProfile ? "meet" : "ask");
  const [website, setWebsite] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const { profile, status } = read;
  const name = profile?.fields.name?.value;
  const reading = status === "reading";

  // A failed read returns to the question with the reason, not to a dead end.
  useEffect(() => {
    if (status === "error") {
      transition(() => setStep("ask"));
    }
  }, [status]);

  // Screen readers and keyboards follow the step change.
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [step]);

  function onAsk(event: FormEvent) {
    event.preventDefault();
    if (!website.trim()) {
      return;
    }
    transition(() => setStep("meet"));
    void read.read(website);
  }

  function startOver() {
    read.reset();
    setWebsite("");
    transition(() => setStep("ask"));
  }

  return (
    <div
      className="onboarding min-h-dvh bg-background text-foreground"
      data-step={step}
      data-testid="onboarding"
      data-theme="system"
    >
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <Link aria-label="Nota" className="flex items-center gap-2" href="/start">
          <NotaGlyph />
          <span className="text-lg font-bold tracking-tight">Nota.</span>
        </Link>
        <Trail step={step} />
        <Link
          className="inline-flex min-h-11 items-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          href="/login"
        >
          Sign in
        </Link>
      </header>

      {step === "ask" ? (
        <main className="mx-auto flex max-w-6xl flex-col items-center px-5 pt-[8vh] sm:px-8 sm:pt-[11vh]">
          <div className="w-full max-w-[40rem] text-center">
            <h1 className="onboarding-title" ref={heading} tabIndex={-1}>
              What&rsquo;s your <HighlighterSwipe>website?</HighlighterSwipe>
            </h1>
            <p className="mx-auto mt-5 max-w-[30rem] font-voice text-xl text-muted-foreground">
              Nota reads it and hands you your first invoice, already in your name and colours.
            </p>

            <form className="mt-9" data-testid="onboarding-ask-form" onSubmit={onAsk}>
              <label className="sr-only" htmlFor="onboarding-website">
                Your website address
              </label>
              <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-2 shadow-[0_1px_0_var(--line)] focus-within:border-foreground sm:flex-row">
                <input
                  autoCapitalize="none"
                  autoComplete="url"
                  autoCorrect="off"
                  autoFocus
                  className="h-12 min-w-0 flex-1 bg-transparent px-3 font-mono text-base outline-none placeholder:text-muted-foreground/60"
                  data-testid="onboarding-website"
                  id="onboarding-website"
                  inputMode="url"
                  onChange={(event) => setWebsite(event.target.value)}
                  placeholder="yourstudio.com"
                  spellCheck={false}
                  value={website}
                />
                <Button
                  className="h-12 px-6 text-base font-semibold"
                  data-testid="onboarding-read"
                  disabled={!website.trim()}
                  type="submit"
                >
                  Read my site <ArrowRight aria-hidden="true" />
                </Button>
              </div>
            </form>

            {read.error ? (
              <p
                className="mt-4 text-sm text-destructive"
                data-testid="onboarding-error"
                role="alert"
              >
                {read.error} Check the address, or start with a blank invoice below.
              </p>
            ) : null}

            <p className="mt-5 text-sm text-muted-foreground">
              No website?{" "}
              <Link
                className="font-medium text-foreground underline underline-offset-4"
                data-testid="onboarding-blank"
                href="/register"
              >
                Start with a blank invoice
              </Link>
            </p>
          </div>

          {/* The blank invoice waits at the foot of the page, then becomes the preview. */}
          <div aria-hidden="true" className="mt-14 w-full max-w-[34rem] sm:mt-20">
            <div className="onboarding-peek">
              <HalftoneShadow className="onboarding-invoice">
                <InvoicePreview profile={null} reading={false} />
              </HalftoneShadow>
            </div>
          </div>
        </main>
      ) : null}

      {step === "meet" ? (
        <main className="mx-auto grid max-w-6xl gap-10 px-5 pt-6 pb-32 sm:px-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16 lg:pt-12 lg:pb-16">
          <section className="min-w-0">
            <p
              aria-live="polite"
              className="nota-label text-muted-foreground"
              data-testid="onboarding-status"
            >
              {reading ? `Reading ${profile?.domain ?? "your website"}` : `From ${profile?.domain}`}
              {reading ? <span className="onboarding-dots" /> : null}
            </p>
            <h1
              className="onboarding-title mt-3"
              data-testid="onboarding-title"
              ref={heading}
              tabIndex={-1}
            >
              {name ? (
                <>
                  Nice to meet you, <HighlighterSwipe>{name}</HighlighterSwipe>.
                </>
              ) : (
                <>Reading your website…</>
              )}
            </h1>

            <div className="mt-8">
              <Meet read={read} />
            </div>

            <div className="mt-10 hidden items-center gap-5 lg:flex">
              <Button
                className="h-12 px-6 text-base font-semibold"
                data-testid="onboarding-keep"
                disabled={!name}
                onClick={() => transition(() => setStep("save"))}
                type="button"
              >
                Keep this invoice <ArrowRight aria-hidden="true" />
              </Button>
              <button
                className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                data-testid="onboarding-different"
                onClick={startOver}
                type="button"
              >
                Use a different website
              </button>
            </div>
            <p className="mt-5 hidden text-xs text-muted-foreground lg:block">
              Nothing is saved until you create your account.
            </p>
          </section>

          <section className="min-w-0 lg:sticky lg:top-8 lg:self-start">
            <HalftoneShadow className="onboarding-invoice">
              <InvoicePreview profile={profile} reading={reading} />
            </HalftoneShadow>
          </section>

          <div className="fixed inset-x-0 bottom-0 z-10 flex items-center gap-4 border-t bg-background/95 px-5 py-3 backdrop-blur lg:hidden">
            <Button
              className="h-12 flex-1 px-5 text-base font-semibold"
              data-testid="onboarding-keep-mobile"
              disabled={!name}
              onClick={() => transition(() => setStep("save"))}
              type="button"
            >
              Keep this invoice <ArrowRight aria-hidden="true" />
            </Button>
            <button
              className="min-h-11 text-sm text-muted-foreground underline underline-offset-4"
              onClick={startOver}
              type="button"
            >
              Different site
            </button>
          </div>
        </main>
      ) : null}

      {step === "save" ? (
        <main className="mx-auto grid max-w-6xl gap-10 px-5 pt-6 pb-16 sm:px-8 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:gap-16 lg:pt-12">
          <section className="min-w-0">
            <h1 className="onboarding-title" ref={heading} tabIndex={-1}>
              Save your <HighlighterSwipe>invoice.</HighlighterSwipe>
            </h1>
            <p className="mt-5 max-w-[30rem] font-voice text-xl text-muted-foreground">
              Create your account and {name ? `${name}’s` : "your"} invoice is yours to send. Next,
              tell Nota who the first one is for.
            </p>
            <div className="mt-10 hidden max-w-[24rem] lg:block">
              <HalftoneShadow className="onboarding-invoice -rotate-2">
                <InvoicePreview compact profile={profile} reading={reading} />
              </HalftoneShadow>
            </div>
          </section>
          <section className="min-w-0 lg:pt-3">
            <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
              <SaveForm onBack={() => transition(() => setStep("meet"))} settle={read.settle} />
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Your website was only read, never changed. Details found elsewhere stay marked as
              unconfirmed until you confirm them.
            </p>
          </section>
        </main>
      ) : null}
    </div>
  );
}
