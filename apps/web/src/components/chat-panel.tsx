"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isTextUIPart, isToolOrDynamicToolUIPart, type UIMessage } from "ai";
import {
  ArrowLeft,
  ArrowRight,
  Download,
  FileArchive,
  LoaderCircle,
  Paperclip,
  Send,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { ChatClientImport } from "@/components/chat-client-import";
import { ChatMarkdown } from "@/components/chat-markdown";
import { NotaGlyph } from "@/components/nota-marks";
import { Button } from "@/components/ui/button";
import type { ChatActivity } from "@/lib/chat-store";
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
  "Create a draft invoice",
  "Who still owes me money?",
  "Download all invoices for last quarter",
] as const;

const transport = new DefaultChatTransport({
  api: "/api/chat",
  credentials: "same-origin",
});

function getPageContextLabel(pathname: string) {
  if (pathname === "/invoices/new") {
    return "a new invoice";
  }
  if (/^\/invoices\/[^/]+\/edit$/.test(pathname)) {
    return "an invoice editor";
  }
  if (/^\/invoices\/[^/]+$/.test(pathname)) {
    return "an invoice";
  }
  if (pathname === "/invoices") {
    return "your invoices";
  }
  if (/^\/clients\/[^/]+$/.test(pathname)) {
    return "a client";
  }
  if (pathname === "/clients") {
    return "your clients";
  }
  if (pathname === "/settings") {
    return "settings";
  }
  return "this page";
}

function getToolLabel(type: string) {
  const raw = type.startsWith("tool-") ? type.slice(5) : type;
  return raw.replaceAll("_", " ").replaceAll(/\b\w/g, (char) => char.toUpperCase());
}

function formatActivity(activity: ChatActivity) {
  const action = activity.action.replaceAll("_", " ");
  const source = activity.sourceClient ?? (activity.source === "cli" ? "Nota CLI" : "an agent");
  return `${activity.invoiceNumber} · ${action} via ${source}`;
}

function formatInvoiceAmount(
  total: string | null | undefined,
  currency: string | null | undefined,
) {
  return formatCurrency(Number(total ?? 0), currency ?? "EUR");
}

function ToolResultCard({ output, type }: { output: ToolOutputShape; type: string }) {
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
            <p className="mt-0.5 truncate text-xs text-zinc-500">{output.filename}</p>
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

  if ((output.kind === "invoice-analysis" || output.kind === "client-insights") && output.summary) {
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
                  <span className="text-xs font-semibold text-zinc-900">{currency.currency}</span>
                  {currency.averageDaysToPay !== null && currency.averageDaysToPay !== undefined ? (
                    <span className="text-[11px] text-zinc-500">
                      Paid in {currency.averageDaysToPay} days avg.
                    </span>
                  ) : null}
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <Metric currency={currency.currency} label="Issued" value={currency.issued} />
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
                  <Metric currency={currency.currency} label="Overdue" value={currency.overdue} />
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
        <p className="font-mono text-sm font-semibold text-zinc-950">{output.invoice.number}</p>
        <p className="mt-1 text-sm text-zinc-600">
          {output.invoice.clientName ?? "Unknown client"}
        </p>
        <div className="mt-3 flex items-center justify-between text-sm text-zinc-700">
          <span>{formatInvoiceAmount(output.invoice.total, output.invoice.currency)}</span>
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
        {output.warning ? <p className="mt-2 text-xs text-amber-700">{output.warning}</p> : null}
      </div>
    );
  }

  if (output.client?.name) {
    return (
      <div className="rounded-2xl border border-zinc-200/80 bg-white px-3 py-3 shadow-sm">
        <p className="text-[11px] font-medium tracking-[0.2em] text-zinc-500 uppercase">{label}</p>
        <p className="mt-1 text-sm font-semibold text-zinc-950">{output.client.name}</p>
        <p className="text-sm text-zinc-600">{output.client.email ?? "No email"}</p>
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
                <p className="text-xs text-zinc-500">{invoice.clientName ?? "Unknown client"}</p>
              </div>
              <div className="text-right">
                <p className="text-zinc-800">
                  {formatInvoiceAmount(invoice.total, invoice.currency)}
                </p>
                <p className="text-xs text-zinc-500 uppercase">{invoice.status}</p>
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
              <p className="text-sm font-medium text-zinc-950">{client.name ?? "Unnamed client"}</p>
              <p className="text-xs text-zinc-500">{client.email ?? "No email"}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (output.kind === "dashboard" && output.counts) {
    return (
      <div className="rounded-2xl border border-zinc-200/80 bg-white px-3 py-3 shadow-sm">
        <p className="text-[11px] font-medium tracking-[0.2em] text-zinc-500 uppercase">{label}</p>
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
      <p className="text-[11px] font-medium tracking-[0.2em] text-zinc-500 uppercase">{label}</p>
      <p className="mt-1 text-sm text-zinc-700">{output.message ?? "Tool completed."}</p>
    </div>
  );
}

function Metric({ currency, label, value }: { currency?: string; label: string; value?: number }) {
  return (
    <div>
      <dt className="text-zinc-500">{label}</dt>
      <dd className="mt-0.5 font-medium text-zinc-900 tabular-nums">
        {formatCurrency(value ?? 0, currency ?? "EUR")}
      </dd>
    </div>
  );
}

function ToolPart({ part }: { part: Extract<UIMessage["parts"][number], { type: string }> }) {
  if (!isToolOrDynamicToolUIPart(part)) {
    return null;
  }

  const label = getToolLabel(part.type === "dynamic-tool" ? part.toolName : part.type);

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
  const hasTools = message.parts.some((part) => isToolOrDynamicToolUIPart(part));

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[88%] space-y-2",
          isUser
            ? "rounded-lg bg-secondary px-4 py-3 text-secondary-foreground"
            : "rounded-lg border bg-card px-4 py-3 text-card-foreground",
        )}
      >
        {hasText ? (
          <div className="space-y-2 text-sm leading-6">
            {message.parts.map((part, index) =>
              isTextUIPart(part) ? (
                isUser ? (
                  <p className="whitespace-pre-wrap" key={`${message.id}-text-${index}`}>
                    {part.text}
                  </p>
                ) : (
                  <ChatMarkdown key={`${message.id}-text-${index}`}>{part.text}</ChatMarkdown>
                )
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

export function ChatPanel({
  inputRef,
  mode,
  onOpenChange,
  open,
}: {
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  mode: "home" | "panel";
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [activity, setActivity] = useState<Array<ChatActivity>>([]);
  const [input, setInput] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const toggleButton = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const refreshedMessages = useRef<Set<string>>(new Set());

  useEffect(() => {
    const panel = dialog.current;
    if (!panel) {
      if (mode === "home" && open) {
        wasOpen.current = true;
        inputRef.current?.focus();
      }
      if (!open && wasOpen.current) {
        (mode === "home" && !csvFile ? inputRef.current : toggleButton.current)?.focus();
        wasOpen.current = false;
      }
      return;
    }
    if (!open) {
      if (panel.open) {
        panel.close();
      }
      if (wasOpen.current) {
        setTimeout(() => toggleButton.current?.focus());
      }
      wasOpen.current = false;
      return;
    }
    const desktop = window.matchMedia("(min-width: 1280px)");
    // Keep the composer mounted so minimising chat cannot reset an in-flight import.
    // Native modality contains focus and makes the covered page inert on small screens.
    const syncModality = () => {
      if (!desktop.matches && !panel.matches(":modal")) {
        if (panel.open) {
          panel.close();
        }
        panel.showModal();
      } else if (desktop.matches && panel.matches(":modal")) {
        panel.close();
        panel.show();
      } else if (desktop.matches && !panel.open) {
        panel.show();
      }
    };
    syncModality();
    (inputRef.current ?? closeButton.current)?.focus();
    wasOpen.current = open;
    desktop.addEventListener("change", syncModality);
    return () => desktop.removeEventListener("change", syncModality);
  }, [csvFile, inputRef, mode, open]);

  const { clearError, error, messages, sendMessage, setMessages, status } = useChat({
    experimental_throttle: 50,
    transport,
  });

  const isBusy = !historyLoaded || status === "submitted" || status === "streaming" || importBusy;

  useEffect(() => {
    let active = true;
    void fetch("/api/chat")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { activity?: Array<ChatActivity>; messages?: Array<UIMessage> } | null) => {
        if (active && data?.activity) {
          setActivity(data.activity);
        }
        if (active && data?.messages) {
          setMessages(data.messages);
        }
      })
      .finally(() => {
        if (active) {
          setHistoryLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, [setMessages]);

  useEffect(() => {
    const latestToolMessage = [...messages]
      .reverse()
      .find(
        (message) =>
          message.role === "assistant" &&
          message.parts.some(
            (part) => isToolOrDynamicToolUIPart(part) && part.state === "output-available",
          ),
      );

    if (!latestToolMessage || refreshedMessages.current.has(latestToolMessage.id)) {
      return;
    }

    refreshedMessages.current.add(latestToolMessage.id);
    router.refresh();
  }, [messages, router]);

  const headerLabel = useMemo(() => getPageContextLabel(pathname), [pathname]);

  async function submitInput(value: string) {
    const trimmedValue = value.trim();
    if (!trimmedValue || isBusy) {
      return;
    }

    clearError();
    onOpenChange(true);

    try {
      const entityId = pathname.match(/^\/(?:clients|invoices)\/([\da-f-]{36})(?:\/|$)/i)?.[1];
      await sendMessage(
        { text: trimmedValue },
        { body: { pageContext: { entityId, route: pathname } } },
      );
      setInput("");
    } catch {
      // useChat exposes the request failure via `error`; swallow here to avoid an unhandled rejection
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitInput(input);
  }

  function closePanel() {
    onOpenChange(false);
    setTimeout(() => toggleButton.current?.focus());
  }

  function renderComposer(homePrompt = false) {
    if (csvFile) {
      return null;
    }

    return (
      <form
        className={cn(
          "shrink-0 bg-card focus-within:ring-2 focus-within:ring-ring/30",
          homePrompt
            ? "rounded-[14px] border p-4 shadow-[0_16px_40px_-28px_rgb(25_21_16/55%)]"
            : "p-3",
        )}
        onSubmit={handleSubmit}
      >
        <label className="nota-label block px-2 text-foreground" htmlFor="nota-chat-input">
          {homePrompt ? "What did you do?" : "Say what you did"}
        </label>
        <textarea
          aria-label="Ask Nota"
          className={cn(
            "w-full resize-none border-0 bg-transparent px-2 py-2 leading-6 text-foreground placeholder:text-muted-foreground",
            "focus-visible:outline-none",
            homePrompt ? "font-voice text-xl" : "text-sm",
          )}
          data-testid="chat-panel-input"
          id="nota-chat-input"
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && input.trim() && !isBusy) {
              event.preventDefault();
              void submitInput(input);
            }
          }}
          placeholder={
            homePrompt
              ? "Invoice Oxide for 46 hours of consulting in September, same rate as last time"
              : "Bill, chase, quote or ask…"
          }
          ref={inputRef}
          rows={homePrompt ? 2 : 3}
          value={input}
        />
        {homePrompt ? (
          <div className="mb-3 flex flex-wrap gap-1.5 px-2">
            {STARTER_PROMPTS.map((prompt) => (
              <button
                className="min-h-8 rounded-full border px-3 text-xs hover:bg-accent"
                disabled={isBusy}
                key={prompt}
                onClick={() => void submitInput(prompt)}
                type="button"
              >
                {prompt}
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-3 px-2 pb-1">
          <input
            accept=".csv,text/csv"
            aria-label="Client CSV file"
            className="hidden"
            data-testid="client-csv-input"
            onChange={(event) => {
              onOpenChange(true);
              setCsvFile(event.target.files?.[0] ?? null);
              event.target.value = "";
            }}
            ref={fileInput}
            type="file"
          />
          <Button
            aria-label="Attach client CSV"
            disabled={isBusy}
            onClick={() => fileInput.current?.click()}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <Paperclip />
          </Button>
          <span className="hidden font-mono text-[11px] text-muted-foreground sm:inline">
            {homePrompt ? "Enter to send" : "⌘J from anywhere"}
          </span>
          <Button disabled={!input.trim() || isBusy} size="sm" type="submit">
            <Send />
            {homePrompt ? "Draft it" : "Send"}
          </Button>
        </div>
      </form>
    );
  }

  const conversation = (
    <>
      <header className="flex items-center justify-between gap-4 border-b px-5 py-4">
        {mode === "home" ? (
          <Button onClick={() => onOpenChange(false)} size="sm" type="button" variant="ghost">
            <ArrowLeft />
            Back to Home
          </Button>
        ) : (
          <div className="min-w-0">
            <p className="nota-label truncate text-foreground">
              Nota <span className="opacity-40">/</span> {headerLabel}
            </p>
          </div>
        )}
        {mode === "panel" ? (
          <Button
            aria-label="Close chat"
            onClick={closePanel}
            ref={closeButton}
            size="icon-sm"
            type="button"
            variant="outline"
          >
            <ArrowRight />
          </Button>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5">
        {activity.length > 0 ? (
          <ol aria-label="Recent agent activity" className="space-y-2">
            {activity.map((item) => (
              <li className="nota-label text-muted-foreground" key={item.id}>
                {formatActivity(item)}
              </li>
            ))}
          </ol>
        ) : null}
        {messages.length === 0 ? (
          <div className="space-y-4 rounded-md border border-dashed bg-background p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Put Nota to work</p>
            <p className="font-voice text-base">Clients, invoices, and getting paid.</p>
            <div className="flex flex-wrap gap-1.5">
              {STARTER_PROMPTS.map((prompt) => (
                <button
                  className="min-h-8 rounded-full border px-3 text-xs hover:bg-accent"
                  disabled={isBusy}
                  key={prompt}
                  onClick={() => void submitInput(prompt)}
                  type="button"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => <MessageBubble key={message.id} message={message} />)
        )}

        {csvFile ? (
          <ChatClientImport
            file={csvFile}
            key={`${csvFile.name}-${csvFile.lastModified}`}
            onBusyChange={setImportBusy}
            onComplete={(result) => {
              router.refresh();
              setMessages((previous) => [
                ...previous,
                {
                  id: crypto.randomUUID(),
                  parts: [{ text: "Import my client CSV.", type: "text" }],
                  role: "user",
                },
                {
                  id: crypto.randomUUID(),
                  parts: [
                    {
                      text: `Added **${result.added} client${result.added === 1 ? "" : "s"}** from your CSV. Skipped ${result.counts.duplicate} duplicates and ${result.counts.invalid} rows needing attention. No invoices were created or sent.`,
                      type: "text",
                    },
                  ],
                  role: "assistant",
                },
              ]);
              setCsvFile(null);
            }}
            onDismiss={() => setCsvFile(null)}
          />
        ) : null}

        {isBusy ? (
          <div className="flex items-center gap-2 px-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Thinking…
          </div>
        ) : null}
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
            {error.message}
          </div>
        ) : null}
      </div>

      {csvFile ? null : renderComposer()}
    </>
  );

  if (mode === "home") {
    return (
      <>
        <section aria-label="Ask Nota" className="mx-auto mt-8 max-w-3xl" hidden={open}>
          {csvFile ? (
            <Button
              onClick={() => onOpenChange(true)}
              ref={toggleButton}
              type="button"
              variant="outline"
            >
              <NotaGlyph />
              Continue importing {csvFile.name}
            </Button>
          ) : (
            renderComposer(true)
          )}
        </section>
        {open || csvFile ? (
          <section
            aria-label="Conversation with Nota"
            className="mx-auto flex h-[calc(100dvh-10rem)] max-w-3xl flex-col overflow-hidden rounded-lg border bg-card"
            hidden={!open}
          >
            {conversation}
          </section>
        ) : null}
      </>
    );
  }

  return (
    <>
      <button
        aria-expanded="false"
        className="fixed right-4 bottom-4 z-20 inline-flex min-h-[46px] items-center gap-2.5 rounded-full border bg-card px-4 pl-3 text-sm font-semibold shadow-[0_14px_30px_-18px_rgb(25_21_16/60%)] hover:bg-accent sm:right-6 sm:bottom-6"
        data-testid="chat-panel-toggle"
        hidden={open}
        onClick={() => onOpenChange(true)}
        ref={toggleButton}
        type="button"
      >
        <NotaGlyph />
        {csvFile ? `Continue importing ${csvFile.name}` : "Ask Nota"}
        {!csvFile ? (
          <kbd className="font-mono text-[11px] font-normal text-muted-foreground">⌘J</kbd>
        ) : null}
      </button>
      <dialog
        aria-label="Nota Chat"
        className="fixed inset-0 z-30 m-0 h-dvh max-h-none w-screen max-w-none flex-col overflow-hidden border bg-card p-0 text-foreground backdrop:bg-background/70 open:flex sm:inset-y-0 sm:right-0 sm:left-auto sm:w-[340px]"
        onCancel={(event) => {
          event.preventDefault();
          closePanel();
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          if (!isBusy && !csvFile) {
            setCsvFile(event.dataTransfer.files[0] ?? null);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            closePanel();
          }
        }}
        ref={dialog}
      >
        {conversation}
      </dialog>
    </>
  );
}
