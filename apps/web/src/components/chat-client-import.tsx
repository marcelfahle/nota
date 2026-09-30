"use client";

import { Check, FileSpreadsheet, LoaderCircle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { ClientImportPreview } from "@/lib/client-import";

type ImportResult = { added: number; counts: ClientImportPreview["counts"] };
type Props = {
  file: File;
  onBusyChange: (busy: boolean) => void;
  onComplete: (result: ImportResult) => void;
  onDismiss: () => void;
};

export function ChatClientImport({ file, onBusyChange, onComplete, onDismiss }: Props) {
  const [preview, setPreview] = useState<ClientImportPreview | null>(null);
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const commitInFlight = useRef(false);
  const card = useRef<HTMLElement>(null);

  useEffect(() => {
    card.current?.scrollIntoView({ block: "nearest" });
  }, [preview]);

  useEffect(() => {
    const controller = new AbortController();
    onBusyChange(true);
    async function readFile() {
      try {
        if (!/\.csv$/i.test(file.name)) {
          throw new Error("Choose a .csv client export.");
        }
        if (file.size > 250 * 1024) {
          throw new Error("Keep client CSV files under 250 KB (up to 1,000 clients).");
        }
        const content = await file.text();
        if (controller.signal.aborted) {
          return;
        }
        const response = await fetch("/api/clients/import", {
          body: JSON.stringify({ csv: content, mode: "preview" }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]),
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error ?? "This file could not be read.");
        }
        if (controller.signal.aborted) {
          return;
        }
        setCsv(content);
        setPreview(result.data);
      } catch (error) {
        if (!controller.signal.aborted) {
          setError(error instanceof Error ? error.message : "This file could not be read.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setBusy(false);
          onBusyChange(false);
        }
      }
    }
    void readFile();
    return () => {
      controller.abort();
      onBusyChange(false);
    };
  }, [file, onBusyChange]);

  async function commit() {
    if (!preview || commitInFlight.current) {
      return;
    }
    commitInFlight.current = true;
    setBusy(true);
    onBusyChange(true);
    setError("");
    try {
      const response = await fetch("/api/clients/import", {
        body: JSON.stringify({ csv, mode: "commit", previewHash: preview.hash }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
        signal: AbortSignal.timeout(30_000),
      });
      const result = await response.json();
      if (response.status === 409 && result.data) {
        setPreview(result.data);
      }
      if (!response.ok) {
        throw new Error(result.error ?? "The import could not finish. Try again.");
      }
      onComplete(result.data);
    } catch (error) {
      setError(error instanceof Error ? error.message : "The import could not finish. Try again.");
    } finally {
      commitInFlight.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  }

  return (
    <section
      aria-label="Client CSV import"
      className="rounded-[22px] border border-zinc-200 bg-[#fcfcfa] p-4 shadow-sm"
      data-testid="client-import-card"
      ref={card}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <FileSpreadsheet className="size-4 shrink-0 text-zinc-500" />
          <p className="truncate text-sm font-medium text-zinc-900" title={file.name}>
            {file.name}
          </p>
        </div>
        <Button
          aria-label="Dismiss CSV import"
          disabled={busy}
          onClick={onDismiss}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <X className="size-4" />
        </Button>
      </div>
      {busy && !preview ? (
        <p aria-live="polite" className="mt-3 flex items-center gap-2 text-sm text-zinc-500">
          <LoaderCircle className="size-4 animate-spin" />
          Reading your client list…
        </p>
      ) : null}
      {preview ? (
        <>
          <p className="mt-3 text-sm leading-6 text-zinc-900">
            {preview.counts.ready} new client{preview.counts.ready === 1 ? "" : "s"} ready.
          </p>
          {preview.counts.duplicate || preview.counts.invalid ? (
            <p className="text-xs leading-5 text-zinc-500">
              {preview.counts.duplicate} already listed · {preview.counts.invalid}{" "}
              {preview.counts.invalid === 1 ? "needs" : "need"} attention. These rows will be
              skipped.
            </p>
          ) : null}
          <Button
            className="mt-3 w-full"
            disabled={busy || preview.counts.ready === 0}
            onClick={() => void commit()}
            size="sm"
            type="button"
          >
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}
            {busy
              ? "Adding clients…"
              : `Add ${preview.counts.ready} client${preview.counts.ready === 1 ? "" : "s"}`}
          </Button>
          <p className="mt-2 text-[11px] leading-4 text-zinc-500">
            Existing clients stay intact. No invoices or emails are created.
          </p>
          <details className="mt-3 text-xs text-zinc-600">
            <summary className="cursor-pointer py-1 font-medium">
              Review {preview.counts.total} row{preview.counts.total === 1 ? "" : "s"} and matched
              columns
            </summary>
            <p className="mt-2 leading-5">
              {preview.columns
                .map(
                  ({ field, header }) =>
                    `${header} → ${field
                      .replaceAll(/([A-Z])/g, " $1")
                      .replace(/^default /i, "")
                      .replace(/^./, (char) => char.toUpperCase())}`,
                )
                .join(" · ")}
            </p>
            {preview.ignoredColumns.length ? (
              <p className="mt-1 leading-5">Unused columns: {preview.ignoredColumns.join(", ")}</p>
            ) : null}
            <div className="mt-2 max-h-64 space-y-2 overflow-y-auto">
              {preview.rows.map((row) => (
                <div
                  className="rounded-lg border border-zinc-200 bg-white p-2 break-words"
                  key={row.line}
                >
                  <p className="font-medium text-zinc-900">
                    Line {row.line} · {row.client.name || "Missing name"} ·{" "}
                    {row.status === "ready" ? "Add" : "Skip"}
                  </p>
                  <p>
                    {row.client.email || "Missing email"} · {row.client.defaultCurrency}
                  </p>
                  {row.client.company && row.client.company !== row.client.name ? (
                    <p>{row.client.company}</p>
                  ) : null}
                  {row.client.address ? (
                    <p className="mt-1 whitespace-pre-line">{row.client.address}</p>
                  ) : null}
                  {row.client.vatNumber ? <p>VAT: {row.client.vatNumber}</p> : null}
                  {row.client.notes ? (
                    <p className="mt-1 whitespace-pre-line">{row.client.notes}</p>
                  ) : null}
                  {row.reason ? <p className="mt-1 text-amber-800">{row.reason}</p> : null}
                </div>
              ))}
            </div>
          </details>
        </>
      ) : null}
      {error ? (
        <p aria-live="polite" className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
