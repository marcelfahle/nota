"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isTextUIPart, isToolOrDynamicToolUIPart, type UIMessage } from "ai";
import {
  ArrowLeft,
  ArrowRight,
  ChevronUp,
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

// Below this width the first-run chat docks to the bottom edge, under the invoice.
const DOCK_QUERY = "(max-width: 1023px)";

function isDocked(mode: "first-run" | "home" | "panel") {
  return mode === "first-run" && window.matchMedia(DOCK_QUERY).matches;
}

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
  dockAction,
  inputRef,
  mode,
  onDockSubmit,
  onOpenChange,
  open,
  prompt,
  starterPrompts = STARTER_PROMPTS,
}: {
  /** First run only: the one next step, offered in the phone dock. */
  dockAction?: { label: string; onClick: () => void };
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  mode: "first-run" | "home" | "panel";
  /** First run only: a message was sent from the phone dock. */
  onDockSubmit?: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  prompt?: { label: string; placeholder: string; question?: string; submitLabel: string };
  starterPrompts?: ReadonlyArray<string>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [activity, setActivity] = useState<Array<ChatActivity>>([]);
  const [available, setAvailable] = useState(true);
  const [input, setInput] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const conversationContainer = useRef<HTMLElement>(null);
  const messagesContainer = useRef<HTMLDivElement>(null);
  const toggleButton = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const refreshedMessages = useRef<Set<string>>(new Set());

  useEffect(() => {
    const panel = dialog.current;
    if (!panel) {
      // Docked, focusing the composer would raise the keyboard over the transcript.
      const docked = isDocked(mode);
      if (mode !== "panel" && open) {
        wasOpen.current = true;
        (docked ? backButton.current : inputRef.current)?.focus();
      }
      if (!open && wasOpen.current) {
        if (!docked) {
          (mode !== "panel" && !csvFile ? inputRef.current : toggleButton.current)?.focus();
        }
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

  useEffect(() => {
    // The first-run dock tracks the keyboard even while the transcript is closed.
    const docked = mode === "first-run";
    if (!open && !docked) {
      return;
    }

    const container = mode === "panel" ? dialog.current : conversationContainer.current;
    const mobile = window.matchMedia(docked ? DOCK_QUERY : "(max-width: 639px)");
    const viewport = window.visualViewport;
    if (!container || !mobile.matches) {
      return;
    }

    function syncViewport() {
      const height = viewport?.height ?? window.innerHeight;
      const offsetTop = viewport?.offsetTop ?? 0;
      const messages = messagesContainer.current;
      const distanceFromBottom = messages
        ? messages.scrollHeight - messages.scrollTop - messages.clientHeight
        : 0;
      // Docked, the whole first-run pane is sized to what the keyboard leaves visible.
      const sized = docked ? document.documentElement : container;
      sized?.style.setProperty("--chat-viewport-height", `${height}px`);
      sized?.style.setProperty("--chat-viewport-top", `${offsetTop}px`);
      if (docked && container) {
        const keyboard =
          viewport && viewport.scale === 1
            ? Math.max(0, document.documentElement.clientHeight - height - offsetTop)
            : 0;
        container.dataset.keyboard = String(keyboard > 120);
      }
      requestAnimationFrame(() => {
        if (messages) {
          messages.scrollTop = messages.scrollHeight - messages.clientHeight - distanceFromBottom;
        }
      });
    }

    const previousOverflow = document.body.style.overflow;
    if (open) {
      document.body.style.overflow = "hidden";
      if (docked && messagesContainer.current) {
        messagesContainer.current.scrollTop = messagesContainer.current.scrollHeight;
      }
    }
    syncViewport();
    viewport?.addEventListener("resize", syncViewport);
    viewport?.addEventListener("scroll", syncViewport);
    window.addEventListener("resize", syncViewport);
    return () => {
      if (open) {
        document.body.style.overflow = previousOverflow;
      }
      if (docked) {
        document.documentElement.style.removeProperty("--chat-viewport-height");
        document.documentElement.style.removeProperty("--chat-viewport-top");
      }
      viewport?.removeEventListener("resize", syncViewport);
      viewport?.removeEventListener("scroll", syncViewport);
      window.removeEventListener("resize", syncViewport);
    };
  }, [mode, open]);

  const { clearError, error, messages, sendMessage, setMessages, status } = useChat({
    experimental_throttle: 50,
    transport,
  });

  // A failed request hands the words back rather than losing them.
  const lastSent = useRef("");
  useEffect(() => {
    if (error && lastSent.current) {
      const sent = lastSent.current;
      lastSent.current = "";
      setInput((current) => current || sent);
    }
  }, [error]);

  const isBusy = !historyLoaded || status === "submitted" || status === "streaming" || importBusy;

  useEffect(() => {
    let active = true;
    void fetch("/api/chat")
      .then((response) => (response.ok ? response.json() : null))
      .then(
        (
          data: {
            activity?: Array<ChatActivity>;
            available?: boolean;
            messages?: Array<UIMessage>;
          } | null,
        ) => {
          if (active && data?.available === false) {
            setAvailable(false);
          }
          if (active && data?.activity) {
            setActivity(data.activity);
          }
          if (active && data?.messages) {
            setMessages(data.messages);
          }
        },
      )
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

    const completedTools = latestToolMessage?.parts.filter(
      (part) => isToolOrDynamicToolUIPart(part) && part.state === "output-available",
    ).length;
    const refreshKey = latestToolMessage ? `${latestToolMessage.id}:${completedTools}` : null;

    if (!refreshKey || refreshedMessages.current.has(refreshKey)) {
      return;
    }

    refreshedMessages.current.add(refreshKey);
    router.refresh();
  }, [messages, router]);

  const headerLabel = useMemo(() => getPageContextLabel(pathname), [pathname]);

  async function submitInput(value: string) {
    const trimmedValue = value.trim();
    if (!available || !trimmedValue || isBusy) {
      return;
    }

    clearError();
    if (!open && isDocked(mode)) {
      // Stay on the invoice: put the keyboard away so the draft is seen landing.
      inputRef.current?.blur();
      onDockSubmit?.();
    } else {
      onOpenChange(true);
    }

    try {
      const entityId = pathname.match(/^\/(?:clients|invoices)\/([\da-f-]{36})(?:\/|$)/i)?.[1];
      // Clear at once so the sent words do not sit in the composer while Nota works.
      lastSent.current = value;
      setInput("");
      await sendMessage(
        { text: trimmedValue },
        { body: { pageContext: { entityId, route: pathname } } },
      );
    } catch {
      setInput((current) => current || value);
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

  function renderComposer(variant: "dock" | "home" | "panel" = "panel") {
    if (csvFile) {
      return null;
    }
    if (!available) {
      return (
        <div className="border-t bg-card px-4 py-3 text-sm text-muted-foreground" role="status">
          AI chat is not configured. Invoices, clients, PDF exports, and sending remain available.
        </div>
      );
    }
    // The dock is one composer for both layouts: a slim row on a phone, and on
    // a wide screen the home prompt until the conversation opens.
    const dock = variant === "dock";
    const homePrompt = variant === "home" || (dock && !open);

    return (
      <form
        className={cn(
          "shrink-0 bg-card",
          dock
            ? "grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 px-3 pt-2 pb-[max(.75rem,env(safe-area-inset-bottom))] lg:block lg:focus-within:ring-2 lg:focus-within:ring-ring/30"
            : "focus-within:ring-2 focus-within:ring-ring/30",
          dock && (open ? "lg:p-3" : "lg:rounded-[14px] lg:border lg:p-4"),
          dock && !open && "lg:shadow-[0_16px_40px_-28px_rgb(25_21_16/55%)]",
          variant === "home" &&
            "rounded-[14px] border p-4 shadow-[0_16px_40px_-28px_rgb(25_21_16/55%)]",
          variant === "panel" && "p-3 pb-[max(.75rem,env(safe-area-inset-bottom))]",
        )}
        onSubmit={handleSubmit}
      >
        <label
          className={cn("nota-label block px-2 text-foreground", dock && "max-lg:sr-only")}
          htmlFor="nota-chat-input"
        >
          {homePrompt ? (prompt?.label ?? "What did you do?") : "Say what you did"}
        </label>
        <textarea
          aria-label="Ask Nota"
          className={cn(
            "w-full resize-none border-0 bg-transparent px-2 py-2 leading-6 text-foreground placeholder:text-muted-foreground",
            "focus-visible:outline-none",
            dock &&
              "max-lg:field-sizing-content max-lg:max-h-32 max-lg:min-h-12 max-lg:rounded-lg max-lg:border max-lg:bg-background max-lg:px-3 max-lg:font-voice max-lg:text-lg max-lg:focus-visible:border-foreground",
            dock && (open ? "lg:text-sm" : "lg:min-h-24 lg:font-voice lg:text-xl"),
            variant === "home" && "min-h-24 font-voice text-xl",
            variant === "panel" && "text-base sm:text-sm",
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
              ? (prompt?.placeholder ??
                "Invoice Oxide for 46 hours of consulting in September, same rate as last time")
              : "Bill, chase, quote or ask…"
          }
          ref={inputRef}
          rows={3}
          value={input}
        />
        {homePrompt ? (
          <div className={cn("mb-3 flex flex-wrap gap-1.5 px-2", dock && "max-lg:hidden")}>
            {starterPrompts.map((prompt) => (
              <button
                className="min-h-11 rounded-full border px-3 text-sm hover:bg-accent active:bg-accent sm:min-h-8 sm:text-xs"
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
        <div
          className={cn(
            "flex items-center justify-between gap-3 px-2 pb-1",
            dock && "max-lg:contents",
          )}
        >
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
            className={cn(dock && "max-lg:hidden")}
            disabled={isBusy}
            onClick={() => fileInput.current?.click()}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <Paperclip />
          </Button>
          <span
            className={cn(
              "hidden font-mono text-[11px] text-muted-foreground",
              dock ? "lg:inline" : "sm:inline",
            )}
          >
            {homePrompt ? "Enter to send" : "⌘J from anywhere"}
          </span>
          <Button
            className={cn(dock && "max-lg:h-12 max-lg:px-4")}
            disabled={!input.trim() || isBusy}
            size="sm"
            type="submit"
          >
            <Send />
            {homePrompt ? (prompt?.submitLabel ?? "Draft it") : "Send"}
          </Button>
        </div>
      </form>
    );
  }

  const header = (
    <>
      <header className="flex items-center justify-between gap-4 border-b px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-4 sm:py-4">
        {mode !== "panel" ? (
          <Button
            onClick={() => onOpenChange(false)}
            ref={backButton}
            size="sm"
            type="button"
            variant="ghost"
          >
            <ArrowLeft />
            {mode === "first-run" ? "Back to invoice" : "Back to Home"}
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
    </>
  );

  function renderMessages(hidden = false) {
    return (
      <div
        className="min-h-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-5 [overflow-wrap:anywhere]"
        hidden={hidden}
        ref={messagesContainer}
      >
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
              {starterPrompts.map((prompt) => (
                <button
                  className="min-h-11 rounded-full border px-3 text-sm hover:bg-accent active:bg-accent sm:min-h-8 sm:text-xs"
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
    );
  }

  const conversation = (
    <>
      {header}
      {renderMessages()}
      {csvFile ? null : renderComposer()}
    </>
  );

  if (mode === "first-run") {
    const working = status === "submitted" || status === "streaming";
    const lastReply = [...messages].reverse().find((message) => message.role === "assistant");
    const lastReplyText =
      status === "submitted"
        ? ""
        : (lastReply?.parts
            .filter((part) => isTextUIPart(part))
            .map((part) => part.text)
            .join(" ")
            .replaceAll(/[*_`#>]/g, "")
            .trim() ?? "");
    const quiet = messages.length === 0 && !working && !error;

    return (
      <>
        {open ? (
          <div
            aria-hidden="true"
            className="absolute inset-0 z-20 animate-[dock-fade_180ms_ease-out] bg-background/70 lg:hidden"
            onClick={() => onOpenChange(false)}
          />
        ) : null}
        <section
          aria-label={open ? "Conversation with Nota" : "Ask Nota"}
          className={cn(
            "flex flex-col bg-card",
            // On a phone the invoice is the page and Nota docks under the thumb:
            // one line of reply, the composer, and the transcript a tap away.
            "min-w-0 max-lg:relative max-lg:z-30 max-lg:shrink-0 max-lg:border-t lg:col-start-2 lg:row-start-2",
            // Another field has the keyboard: get out of its way.
            "max-lg:[&[data-keyboard=true]:not(:focus-within)]:hidden",
            open &&
              "overflow-hidden max-lg:h-[min(36rem,calc(var(--chat-viewport-height,100dvh)-9rem))] max-lg:animate-[dock-rise_220ms_cubic-bezier(0.16,1,0.3,1)] lg:h-[min(660px,calc(100dvh-8rem))] lg:rounded-lg lg:border",
          )}
          onKeyDown={(event) => {
            if (event.key === "Escape" && open) {
              onOpenChange(false);
            }
          }}
          ref={conversationContainer}
        >
          {open ? header : null}
          {open || csvFile ? renderMessages(!open) : null}
          {prompt?.question ? (
            <h1
              className={cn(
                "px-4 pt-3 !text-[1.375rem] !leading-7 lg:hidden",
                (open || !quiet) && "sr-only",
              )}
            >
              {prompt.question}
            </h1>
          ) : null}
          {open || quiet ? null : (
            <button
              className="flex min-h-11 w-full items-start gap-2.5 px-4 pt-3 text-left lg:hidden"
              onClick={() => onOpenChange(true)}
              type="button"
            >
              {working ? (
                <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin" />
              ) : (
                <NotaGlyph className="mt-0.5 h-4 shrink-0" />
              )}
              <span
                className={cn(
                  "line-clamp-2 min-w-0 flex-1 font-voice text-base leading-5",
                  error && "text-destructive",
                )}
              >
                {error?.message || lastReplyText || (working ? "Drafting…" : "Nota replied.")}
              </span>
              <span className="sr-only">Show conversation</span>
              <ChevronUp className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            </button>
          )}
          {dockAction && !open ? (
            <button
              className="mx-3 mt-2 flex min-h-11 items-center justify-between gap-3 rounded-lg bg-primary px-4 text-left text-sm font-semibold text-primary-foreground active:brightness-90 lg:hidden"
              onClick={dockAction.onClick}
              type="button"
            >
              {dockAction.label}
              <ArrowRight className="size-4 shrink-0" />
            </button>
          ) : null}
          {csvFile && !open ? (
            <Button
              className="m-3 lg:m-0"
              onClick={() => onOpenChange(true)}
              ref={toggleButton}
              type="button"
              variant="outline"
            >
              <NotaGlyph />
              Continue importing {csvFile.name}
            </Button>
          ) : (
            renderComposer("dock")
          )}
        </section>
      </>
    );
  }

  if (mode === "home") {
    return (
      <>
        <section aria-label="Ask Nota" className="mx-auto mt-8 max-w-[700px]" hidden={open}>
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
            renderComposer("home")
          )}
        </section>
        {open || csvFile ? (
          <section
            aria-label="Conversation with Nota"
            className="fixed inset-x-0 top-[var(--chat-viewport-top,0px)] z-50 mx-auto flex h-[var(--chat-viewport-height,100dvh)] max-w-[700px] flex-col overflow-hidden border bg-card sm:static sm:h-[calc(100dvh-10rem)] sm:rounded-lg"
            hidden={!open}
            ref={conversationContainer}
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
        aria-label={csvFile ? `Continue importing ${csvFile.name}` : "Ask Nota"}
        className="fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] z-20 inline-flex size-[46px] items-center justify-center rounded-full border bg-card text-sm font-semibold shadow-[0_14px_30px_-18px_rgb(25_21_16/60%)] hover:bg-accent active:bg-accent sm:right-6 sm:bottom-6 sm:h-auto sm:min-h-[46px] sm:w-auto sm:gap-2.5 sm:px-4 sm:pl-3"
        data-testid="chat-panel-toggle"
        hidden={open}
        onClick={() => onOpenChange(true)}
        ref={toggleButton}
        type="button"
      >
        <NotaGlyph />
        <span className="hidden sm:inline">
          {csvFile ? `Continue importing ${csvFile.name}` : "Ask Nota"}
        </span>
        {!csvFile ? (
          <kbd className="hidden font-mono text-[11px] font-normal text-muted-foreground sm:inline">
            ⌘J
          </kbd>
        ) : null}
      </button>
      <dialog
        aria-label="Nota Chat"
        className="fixed inset-x-0 top-[var(--chat-viewport-top,0px)] z-50 m-0 h-[var(--chat-viewport-height,100dvh)] max-h-none w-screen max-w-none flex-col overflow-hidden border bg-card p-0 text-foreground backdrop:bg-background/70 open:flex sm:inset-y-0 sm:right-0 sm:left-auto sm:h-dvh sm:w-[340px]"
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
