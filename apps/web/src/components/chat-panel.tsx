"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  isTextUIPart,
  isToolOrDynamicToolUIPart,
  type UIMessage,
} from "ai";
import {
  Bot,
  Download,
  FileArchive,
  LoaderCircle,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

type ToolOutputShape = {
  client?: {
    company?: string | null;
    email?: string | null;
    id?: string;
    name?: string | null;
  };
  clients?: Array<{ email?: string | null; id?: string; name?: string | null }>;
  comparison?: {
    period?: { label?: string };
    summary?: InvoiceAnalysisSummary;
  } | null;
  count?: number;
  counts?: Record<string, number>;
  downloadUrl?: string;
  filename?: string;
  invoice?: {
    clientName?: string | null;
    currency?: string | null;
    dueAt?: string;
    id?: string;
    number?: string;
    status?: string;
    total?: string | null;
  };
  invoices?: Array<{
    clientName?: string | null;
    currency?: string | null;
    dueAt?: string;
    id?: string;
    number?: string;
    status?: string;
    total?: string | null;
  }>;
  kind?: string;
  message?: string;
  pagination?: { page?: number; perPage?: number; total?: number };
  period?: { from?: string | null; label?: string; to?: string | null };
  recentInvoices?: Array<{
    currency?: string | null;
    number?: string;
    status?: string;
    total?: string | null;
  }>;
  summary?: InvoiceAnalysisSummary;
  topClients?: Array<{
    email?: string | null;
    id?: string;
    name?: string | null;
  }>;
  total?: number;
  warning?: string;
};

type InvoiceAnalysisSummary = {
  currencies?: Array<{
    averageDaysToPay?: number | null;
    collected?: number;
    collectionRate?: number;
    currency?: string;
    draft?: number;
    issued?: number;
    outstanding?: number;
    overdue?: number;
    topClients?: Array<{
      clientName?: string;
      issued?: number;
      outstanding?: number;
      overdue?: number;
    }>;
  }>;
  invoiceCount?: number;
  statusCounts?: Record<string, number>;
};

const STARTER_PROMPTS = [
  "Download all invoices for last quarter",
  "Who still owes me money?",
  "Compare this quarter with last quarter",
  "Which clients generated the most revenue this year?",
] as const;

const transport = new DefaultChatTransport({
  api: "/api/chat",
  credentials: "same-origin",
});

function getToolLabel(type: string) {
  const raw = type.startsWith("tool-") ? type.slice(5) : type;
  return raw
    .replaceAll("_", " ")
    .replaceAll(/\b\w/g, (char) => char.toUpperCase());
}

function formatInvoiceAmount(
  total: string | null | undefined,
  currency: string | null | undefined,
) {
  return formatCurrency(Number(total ?? 0), currency ?? "EUR");
}

function ToolResultCard({
  output,
  type,
}: {
  output: ToolOutputShape;
  type: string;
}) {
  const label = getToolLabel(type);

  if (output.kind === "invoice-archive" && output.downloadUrl) {
    return (
      <div className="rounded-2xl border border-zinc-200/80 bg-white px-3 py-3 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700">
            <FileArchive className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium tracking-[0.2em] text-zinc-500 uppercase">
              {output.period?.label ?? label}
            </p>
            <p className="mt-1 text-sm font-medium text-zinc-950">
              {output.count ?? 0} invoice{output.count === 1 ? "" : "s"} · ZIP
            </p>
            <p className="mt-0.5 truncate text-xs text-zinc-500">
              {output.filename}
            </p>
          </div>
        </div>
        <Button asChild className="mt-3 w-full" size="sm">
          <a download={output.filename} href={output.downloadUrl}>
            <Download />
            Download archive
          </a>
        </Button>
      </div>
    );
  }

  if (
    (output.kind === "invoice-analysis" || output.kind === "client-insights") &&
    output.summary
  ) {
    const currencies = output.summary.currencies ?? [];
    return (
      <div className="rounded-2xl border border-zinc-200/80 bg-white px-3 py-3 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium tracking-[0.2em] text-zinc-500 uppercase">
              {output.kind === "client-insights" ? output.client?.name : label}
            </p>
            <p className="mt-1 text-sm font-medium text-zinc-950">
              {output.period?.label ?? "Invoice history"}
            </p>
          </div>
          <span className="text-xs text-zinc-500 tabular-nums">
            {output.summary.invoiceCount ?? 0} invoices
          </span>
        </div>

        {currencies.length > 0 ? (
          <div className="mt-3 divide-y divide-zinc-100 border-y border-zinc-100">
            {currencies.slice(0, 2).map((currency) => (
              <div className="py-3" key={currency.currency ?? "currency"}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-900">
                    {currency.currency}
                  </span>
                  {currency.averageDaysToPay !== null &&
                  currency.averageDaysToPay !== undefined ? (
                    <span className="text-[11px] text-zinc-500">
                      Paid in {currency.averageDaysToPay} days avg.
                    </span>
                  ) : null}
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <Metric
                    currency={currency.currency}
                    label="Issued"
                    value={currency.issued}
                  />
                  <Metric
                    currency={currency.currency}
                    label="Collected"
                    value={currency.collected}
                  />
                  <Metric
                    currency={currency.currency}
                    label="Outstanding"
                    value={currency.outstanding}
                  />
                  <Metric
                    currency={currency.currency}
                    label="Overdue"
                    value={currency.overdue}
                  />
                </dl>
                {currency.topClients?.[0] ? (
                  <p className="mt-2 text-[11px] text-zinc-500">
                    Top client: {currency.topClients[0].clientName}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 border-y border-zinc-100 py-3 text-sm text-zinc-500">
            No matching invoice value.
          </p>
        )}

        {output.comparison?.period?.label ? (
          <p className="mt-2 text-xs text-zinc-500">
            Compared with {output.comparison.period.label}
          </p>
        ) : null}
      </div>
    );
  }

  if (output.invoice?.number) {
    return (
      <div className="rounded-2xl border border-zinc-200/80 bg-white px-3 py-3 shadow-sm">
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="text-[11px] font-medium tracking-[0.2em] text-zinc-500 uppercase">
            {label}
          </p>
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600 uppercase">
            {output.invoice.status ?? "draft"}
          </span>
        </div>
        <p className="font-mono text-sm font-semibold text-zinc-950">
          {output.invoice.number}
        </p>
        <p className="mt-1 text-sm text-zinc-600">
          {output.invoice.clientName ?? "Unknown client"}
        </p>
        <div className="mt-3 flex items-center justify-between text-sm text-zinc-700">
          <span>
            {formatInvoiceAmount(output.invoice.total, output.invoice.currency)}
          </span>
          <span>{output.invoice.dueAt ?? "No due date"}</span>
        </div>
        {output.downloadUrl ? (
          <Button asChild className="mt-3 w-full" size="sm" variant="outline">
            <a href={output.downloadUrl}>
              <Download />
              Download PDF
            </a>
          </Button>
        ) : null}
        {output.warning ? (
          <p className="mt-2 text-xs text-amber-700">{output.warning}</p>
        ) : null}
      </div>
    );
  }

  if (output.client?.name) {
    return (
      <div className="rounded-2xl border border-zinc-200/80 bg-white px-3 py-3 shadow-sm">
        <p className="text-[11px] font-medium tracking-[0.2em] text-zinc-500 uppercase">
          {label}
        </p>
        <p className="mt-1 text-sm font-semibold text-zinc-950">
          {output.client.name}
        </p>
        <p className="text-sm text-zinc-600">
          {output.client.email ?? "No email"}
        </p>
        {output.client.company ? (
          <p className="text-xs text-zinc-500">{output.client.company}</p>
        ) : null}
      </div>
    );
  }

  if (output.kind === "invoice-list" && output.invoices) {
    return (
      <div className="rounded-2xl border border-zinc-200/80 bg-white px-3 py-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[11px] font-medium tracking-[0.2em] text-zinc-500 uppercase">
            {label}
          </p>
          <span className="text-xs text-zinc-500">
            {output.pagination?.total ?? output.invoices.length} total
          </span>
        </div>
        <div className="space-y-2">
          {output.invoices.slice(0, 3).map((invoice) => (
            <div
              className="flex items-center justify-between gap-2 text-sm"
              key={invoice.id ?? invoice.number}
            >
              <div>
                <p className="font-mono text-zinc-950">{invoice.number}</p>
                <p className="text-xs text-zinc-500">
                  {invoice.clientName ?? "Unknown client"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-zinc-800">
                  {formatInvoiceAmount(invoice.total, invoice.currency)}
                </p>
                <p className="text-xs text-zinc-500 uppercase">
                  {invoice.status}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (output.kind === "client-list" && output.clients) {
    return (
      <div className="rounded-2xl border border-zinc-200/80 bg-white px-3 py-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[11px] font-medium tracking-[0.2em] text-zinc-500 uppercase">
            {label}
          </p>
          <span className="text-xs text-zinc-500">
            {output.total ?? output.clients.length} matches
          </span>
        </div>
        <div className="space-y-2">
          {output.clients.slice(0, 3).map((client) => (
            <div key={client.id ?? client.email}>
              <p className="text-sm font-medium text-zinc-950">
                {client.name ?? "Unnamed client"}
              </p>
              <p className="text-xs text-zinc-500">
                {client.email ?? "No email"}
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (output.kind === "dashboard" && output.counts) {
    return (
      <div className="rounded-2xl border border-zinc-200/80 bg-white px-3 py-3 shadow-sm">
        <p className="text-[11px] font-medium tracking-[0.2em] text-zinc-500 uppercase">
          {label}
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
          {Object.entries(output.counts).map(([key, value]) => (
            <div className="rounded-xl bg-zinc-50 px-2 py-2" key={key}>
              <p className="text-[10px] text-zinc-500 uppercase">{key}</p>
              <p className="mt-1 font-semibold text-zinc-950">{value}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-white px-3 py-3 shadow-sm">
      <p className="text-[11px] font-medium tracking-[0.2em] text-zinc-500 uppercase">
        {label}
      </p>
      <p className="mt-1 text-sm text-zinc-700">
        {output.message ?? "Tool completed."}
      </p>
    </div>
  );
}

function Metric({
  currency,
  label,
  value,
}: {
  currency?: string;
  label: string;
  value?: number;
}) {
  return (
    <div>
      <dt className="text-zinc-500">{label}</dt>
      <dd className="mt-0.5 font-medium text-zinc-900 tabular-nums">
        {formatCurrency(value ?? 0, currency ?? "EUR")}
      </dd>
    </div>
  );
}

function ToolPart({
  part,
}: {
  part: Extract<UIMessage["parts"][number], { type: string }>;
}) {
  if (!isToolOrDynamicToolUIPart(part)) {
    return null;
  }

  const label = getToolLabel(
    part.type === "dynamic-tool" ? part.toolName : part.type,
  );

  if (part.state === "output-error") {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
        <p className="font-medium">{label}</p>
        <p className="mt-1">{part.errorText}</p>
      </div>
    );
  }

  if (part.state === "input-streaming" || part.state === "input-available") {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-600">
        <LoaderCircle className="size-4 animate-spin" />
        <span>{label}…</span>
      </div>
    );
  }

  if (part.state === "output-available") {
    return (
      <ToolResultCard
        output={part.output as ToolOutputShape}
        type={part.type === "dynamic-tool" ? part.toolName : part.type}
      />
    );
  }

  return null;
}

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  const hasText = message.parts.some((part) => isTextUIPart(part));
  const hasTools = message.parts.some((part) =>
    isToolOrDynamicToolUIPart(part),
  );

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[88%] space-y-2",
          isUser
            ? "rounded-[22px] rounded-br-md bg-zinc-950 px-4 py-3 text-white"
            : "rounded-[22px] rounded-bl-md border border-zinc-200 bg-[#fcfcfa] px-4 py-3 text-zinc-900 shadow-sm",
        )}
      >
        {hasText ? (
          <div className="space-y-2 text-sm leading-6">
            {message.parts.map((part, index) =>
              isTextUIPart(part) ? (
                <p key={`${message.id}-text-${index}`}>{part.text}</p>
              ) : null,
            )}
          </div>
        ) : null}

        {hasTools ? (
          <div className="space-y-2">
            {message.parts.map((part, index) =>
              isToolOrDynamicToolUIPart(part) ? (
                <ToolPart key={`${message.id}-tool-${index}`} part={part} />
              ) : null,
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ChatPanel() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const refreshedMessages = useRef<Set<string>>(new Set());

  const { clearError, error, messages, sendMessage, status } = useChat({
    experimental_throttle: 50,
    transport,
  });

  const isBusy = status === "submitted" || status === "streaming";

  useEffect(() => {
    const latestToolMessage = [...messages]
      .reverse()
      .find(
        (message) =>
          message.role === "assistant" &&
          message.parts.some(
            (part) =>
              isToolOrDynamicToolUIPart(part) &&
              part.state === "output-available",
          ),
      );

    if (
      !latestToolMessage ||
      refreshedMessages.current.has(latestToolMessage.id)
    ) {
      return;
    }

    refreshedMessages.current.add(latestToolMessage.id);
    router.refresh();
  }, [messages, router]);

  const hasConversation = messages.length > 0;
  const headerLabel = useMemo(
    () =>
      hasConversation
        ? "Working with live Nota data"
        : "Ask Nota to manage invoices, clients, and dashboard stats.",
    [hasConversation],
  );

  async function submitInput(value: string) {
    const trimmedValue = value.trim();
    if (!trimmedValue || isBusy) {
      return;
    }

    clearError();

    try {
      await sendMessage({ text: trimmedValue });
      setInput("");
    } catch {
      // useChat exposes the request failure via `error`; swallow here to avoid an unhandled rejection
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitInput(input);
  }

  return (
    <>
      <button
        className="fixed right-4 bottom-24 z-30 inline-flex items-center gap-2 rounded-full border border-zinc-900 bg-zinc-950 px-4 py-3 text-sm font-medium text-white shadow-2xl shadow-black/25 transition hover:-translate-y-0.5 hover:bg-zinc-900 sm:right-6 sm:bottom-28"
        data-testid="chat-panel-toggle"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <Sparkles className="size-4" />
        Nota Chat
      </button>

      <div
        className={cn(
          "fixed inset-x-4 bottom-40 z-30 flex max-h-[72vh] w-auto flex-col overflow-hidden rounded-[28px] border border-zinc-200 bg-[#f5f3ef] shadow-[0_30px_80px_rgba(15,23,42,0.18)] transition-all duration-300 sm:right-6 sm:bottom-44 sm:left-auto sm:w-[420px]",
          open
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-6 opacity-0",
        )}
      >
        <div className="border-b border-zinc-200 bg-white/80 px-5 py-4 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-zinc-900">
                <div className="flex size-9 items-center justify-center rounded-2xl bg-zinc-950 text-white">
                  <Bot className="size-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold tracking-tight">
                    Nota Chat
                  </p>
                  <p className="text-xs text-zinc-500">{headerLabel}</p>
                </div>
              </div>
            </div>
            <Button
              onClick={() => setOpen(false)}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {messages.length === 0 ? (
            <div className="space-y-4 rounded-[24px] border border-dashed border-zinc-300 bg-white/80 p-4 text-sm text-zinc-600">
              <p className="font-medium text-zinc-900">Put Nota to work</p>
              <div className="divide-y divide-zinc-100 border-y border-zinc-100">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    className="flex min-h-11 w-full items-center justify-between gap-3 py-2.5 text-left text-sm text-zinc-700 transition-colors hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:outline-none"
                    disabled={isBusy}
                    key={prompt}
                    onClick={() => submitInput(prompt)}
                    type="button"
                  >
                    <span>{prompt}</span>
                    <span aria-hidden="true" className="text-zinc-300">
                      →
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))
          )}

          {isBusy ? (
            <div className="flex items-center gap-2 px-2 text-sm text-zinc-500">
              <LoaderCircle className="size-4 animate-spin" />
              Thinking…
            </div>
          ) : null}

          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
              {error.message}
            </div>
          ) : null}
        </div>

        <form
          className="border-t border-zinc-200 bg-white/85 px-4 py-4 backdrop-blur"
          onSubmit={handleSubmit}
        >
          <div className="rounded-[22px] border border-zinc-200 bg-white p-2 shadow-sm">
            <textarea
              className="min-h-[88px] w-full resize-none border-0 bg-transparent px-2 py-2 text-sm leading-6 text-zinc-900 outline-none placeholder:text-zinc-400"
              data-testid="chat-panel-input"
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  input.trim() &&
                  !isBusy
                ) {
                  event.preventDefault();
                  void submitInput(input);
                }
              }}
              placeholder="Ask Nota to create invoices, send them, or summarize your dashboard..."
              value={input}
            />
            <div className="flex items-center justify-between gap-3 px-2 pb-1">
              <p className="text-[11px] text-zinc-400">
                Enter to send, Shift+Enter for a new line.
              </p>
              <Button
                disabled={!input.trim() || isBusy}
                size="sm"
                type="submit"
              >
                <Send className="size-4" />
                Send
              </Button>
            </div>
          </div>
        </form>
      </div>
    </>
  );
}
