"use client";

import { AlertTriangle, Check, ChevronUp, Copy, ExternalLink, Mail, Timer, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export type StripeDockItem = {
  clientName: string | null;
  id: string;
  number: string;
  paidAt: string | null;
  sentAt: string | null;
  status: string | null;
  stripePaymentIntentId: string | null;
  stripePaymentLinkId: string | null;
  stripePaymentLinkUrl: string | null;
  updatedAt: string | null;
};

export type EmailJobDockItem = {
  attempts: number;
  clientName: string | null;
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  lastError: string | null;
  maxAttempts: number;
  runAt: string | null;
  status: string;
  type: string;
  updatedAt: string | null;
};

export type EmailJobDockSummary = {
  dead: number;
  pending: number;
  processing: number;
};

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "n/a";
  }

  return new Date(value).toLocaleString("en-US", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  });
}

function formatJobType(type: string) {
  return type
    .replaceAll("_email", "")
    .replaceAll("_", " ")
    .replaceAll(/\b\w/g, (match) => match.toUpperCase());
}

function CompactValue({
  href,
  label,
  value,
}: {
  href?: string | null;
  label: string;
  value: string | null;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!value) {
      return;
    }

    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2">
      <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-medium tracking-[0.24em] text-zinc-500 uppercase">
        <span>{label}</span>
        {value ? (
          <button
            className="inline-flex items-center gap-1 text-zinc-400 transition hover:text-white"
            onClick={handleCopy}
            type="button"
          >
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate text-[11px] text-zinc-100">
          {value ?? "Not available"}
        </code>
        {href ? (
          <a
            className="inline-flex items-center gap-1 text-[11px] text-emerald-300 transition hover:text-emerald-200"
            href={href}
            rel="noopener noreferrer"
            target="_blank"
          >
            <ExternalLink className="size-3" />
            Open
          </a>
        ) : null}
      </div>
    </div>
  );
}

function JobStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
    dead: "border-red-400/20 bg-red-400/10 text-red-300",
    pending: "border-amber-400/20 bg-amber-400/10 text-amber-300",
    processing: "border-sky-400/20 bg-sky-400/10 text-sky-300",
  };

  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-[0.2em] uppercase ${
        styles[status] ?? "border-white/10 bg-white/[0.04] text-zinc-300"
      }`}
    >
      {status}
    </span>
  );
}

function JobSummaryBadge({ label, value }: { label: string; value: number }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium tracking-[0.18em] text-zinc-300 uppercase">
      {label} {value}
    </span>
  );
}

export function StripeDevDock({
  items,
  jobs,
  jobSummary,
}: {
  items: Array<StripeDockItem>;
  jobs: Array<EmailJobDockItem>;
  jobSummary: EmailJobDockSummary;
}) {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);

  if (hidden) {
    return (
      <button
        className="fixed right-4 bottom-4 z-40 inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950 px-4 py-2 text-xs font-medium text-zinc-100 shadow-2xl shadow-black/30 transition hover:bg-zinc-900"
        data-testid="ops-dock-toggle"
        onClick={() => setHidden(false)}
        type="button"
      >
        Ops Dock
      </button>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-3 sm:px-6">
      <div className="pointer-events-auto mx-auto max-w-6xl overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/96 text-zinc-100 shadow-2xl shadow-black/30 backdrop-blur">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[10px] font-medium tracking-[0.28em] text-zinc-500 uppercase">
              Internal Ops
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">Stripe + Jobs Dock</p>
              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                {items.length} tracked
              </span>
              <JobSummaryBadge label="Pending" value={jobSummary.pending} />
              <JobSummaryBadge label="Processing" value={jobSummary.processing} />
              <JobSummaryBadge label="Dead" value={jobSummary.dead} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              className="border-white/10 bg-white/[0.04] text-zinc-100 hover:bg-white/[0.08]"
              data-testid="ops-dock-expand"
              onClick={() => setOpen((value) => !value)}
              size="sm"
              type="button"
              variant="outline"
            >
              <ChevronUp className={`size-4 transition ${open ? "rotate-180" : ""}`} />
              {open ? "Collapse" : "Expand"}
            </Button>
            <Button
              className="border-white/10 bg-transparent text-zinc-300 hover:bg-white/[0.06] hover:text-white"
              onClick={() => setHidden(true)}
              size="sm"
              type="button"
              variant="outline"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {open ? (
          <div className="max-h-[55vh] overflow-y-auto p-4">
            <div className="mb-3 flex items-center gap-2 text-[10px] font-medium tracking-[0.24em] text-zinc-500 uppercase">
              <Timer className="size-3.5" />
              Stripe Resources
            </div>

            {items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-sm text-zinc-400">
                No Stripe-linked invoices yet. Send an invoice to generate a payment link and
                populate this dock.
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((item) => (
                  <section
                    className="rounded-xl border border-white/10 bg-white/[0.02] p-4"
                    key={item.id}
                  >
                    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <a
                            className="font-mono text-sm font-semibold text-white transition hover:text-emerald-300"
                            href={`/invoices/${item.id}`}
                          >
                            {item.number}
                          </a>
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium tracking-[0.2em] text-zinc-400 uppercase">
                            {item.status ?? "draft"}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-zinc-400">
                          {item.clientName ?? "Unknown client"} · updated{" "}
                          {formatTimestamp(item.updatedAt)}
                        </p>
                      </div>

                      <div className="text-xs text-zinc-400">
                        <span>Sent {formatTimestamp(item.sentAt)}</span>
                        <span className="mx-2 text-zinc-700">/</span>
                        <span>Paid {formatTimestamp(item.paidAt)}</span>
                      </div>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-3">
                      <CompactValue label="Payment Link ID" value={item.stripePaymentLinkId} />
                      <CompactValue
                        href={item.stripePaymentLinkUrl}
                        label="Payment Link URL"
                        value={item.stripePaymentLinkUrl}
                      />
                      <CompactValue label="Payment Intent ID" value={item.stripePaymentIntentId} />
                    </div>
                  </section>
                ))}
              </div>
            )}

            <div className="mt-6">
              <div className="mb-3 flex items-center gap-2 text-[10px] font-medium tracking-[0.24em] text-zinc-500 uppercase">
                <Mail className="size-3.5" />
                Email Jobs
              </div>

              {jobs.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-sm text-zinc-400">
                  No recent email jobs yet. Send an invoice or reminder to inspect delivery retries
                  here.
                </div>
              ) : (
                <div className="space-y-3" data-testid="ops-dock-jobs">
                  {jobs.map((job) => (
                    <section
                      className="rounded-xl border border-white/10 bg-white/[0.02] p-4"
                      key={job.id}
                    >
                      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <a
                              className="font-mono text-sm font-semibold text-white transition hover:text-emerald-300"
                              href={`/invoices/${job.invoiceId}`}
                            >
                              {job.invoiceNumber}
                            </a>
                            <JobStatusBadge status={job.status} />
                          </div>
                          <p className="mt-1 text-xs text-zinc-400">
                            {job.clientName ?? "Unknown client"} · {formatJobType(job.type)}
                          </p>
                        </div>

                        <div className="text-xs text-zinc-400">
                          <span>
                            Attempt {job.attempts}/{job.maxAttempts}
                          </span>
                          <span className="mx-2 text-zinc-700">/</span>
                          <span>Run {formatTimestamp(job.runAt)}</span>
                        </div>
                      </div>

                      <div className="grid gap-3 lg:grid-cols-3">
                        <CompactValue label="Job ID" value={job.id} />
                        <CompactValue label="Updated" value={formatTimestamp(job.updatedAt)} />
                        <CompactValue label="Last Error" value={job.lastError} />
                      </div>

                      {job.status === "dead" && job.lastError ? (
                        <div className="mt-3 rounded-md border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-200">
                          <div className="mb-1 flex items-center gap-2 font-medium tracking-[0.2em] uppercase">
                            <AlertTriangle className="size-3.5" />
                            Dead Letter
                          </div>
                          <p className="break-words">{job.lastError}</p>
                        </div>
                      ) : null}
                    </section>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 px-4 py-3 text-xs text-zinc-400">
            <p>
              Collapsed. Expand to inspect Stripe payment links, queued mail, retries, and recent
              invoice state.
            </p>
            <p className="hidden font-mono text-zinc-500 sm:block">internal / debug only</p>
          </div>
        )}
      </div>
    </div>
  );
}
