import { stripVTControlCharacters } from "node:util";
import chalk, { Chalk } from "chalk";
import stringWidth from "string-width";
import type { Pagination } from "@nota-app/sdk";

export type OutputOptions = { json?: boolean; color?: boolean; input?: boolean; yes?: boolean };
let settings: OutputOptions = {};
export const outputOptions = () => settings;
export function configureOutput(options: OutputOptions) {
  settings = options;
}
export function emit(data: unknown, render: () => void) {
  if (settings.json) console.log(JSON.stringify(data));
  else render();
}
export function clean(value: unknown): string {
  return stripVTControlCharacters(String(value ?? "")).replace(/[\x00-\x1f\x7f-\x9f]/g, " ");
}
const segments = new Intl.Segmenter("en", { granularity: "grapheme" });
export function wrap(value: unknown, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const { segment } of segments.segment(clean(value))) {
    if (stringWidth(line + segment) > Math.max(2, width) && line) {
      lines.push(line.trimEnd());
      line = "";
    }
    line += segment;
  }
  if (line) lines.push(line.trimEnd());
  return lines;
}
export function fit(value: unknown, width: number): string {
  const safe = clean(value);
  if (stringWidth(safe) <= width) return safe + " ".repeat(width - stringWidth(safe));
  let result = "";
  for (const { segment } of segments.segment(safe)) {
    if (stringWidth(result + segment) > width - 1) break;
    result += segment;
  }
  return result + "…" + " ".repeat(Math.max(0, width - stringWidth(result) - 1));
}
export function createUI(
  width = process.stdout.columns || 88,
  write = (line: string) => console.log(line),
) {
  const c = new Chalk({
    level:
      settings.color === false ||
      "NO_COLOR" in process.env ||
      process.env.TERM === "dumb" ||
      !process.stdout.isTTY
        ? 0
        : chalk.level,
  });
  const accent = c.hex("#d1fd39");
  const muted = c.gray;
  const available = Math.max(12, Math.min(width, 110) - 4);
  const line = (value = "") => write(value ? `  ${value}` : "");
  const text = (value: unknown, style: (s: string) => string = (s) => s) =>
    wrap(value, available).forEach((part) => line(style(part)));
  const hint = (value: string) => text(value, muted);
  const heading = (value: string) => {
    line();
    text(value, c.bold);
  };
  const field = (label: string, value: unknown) => {
    if (available < 50) {
      text(`${label}: ${clean(value)}`);
    } else
      wrap(value, available - 18).forEach((part, i) =>
        line(`${muted(i === 0 ? fit(label, 18) : " ".repeat(18))}${part}`),
      );
  };
  const brand = (context = "Invoices, without the busywork.") => {
    const parts = wrap(context, available - 6);
    line(`${accent.bold("nota")}  ${muted(parts[0] || "")}`);
    parts.slice(1).forEach((part) => line(`      ${muted(part)}`));
  };
  const rule = () => line(muted("─".repeat(available)));
  return { c, accent, muted, available, line, text, hint, heading, field, brand, rule };
}
export function formatCurrency(
  total: string | null | undefined,
  currency: string | null | undefined,
) {
  if (total == null || !Number.isFinite(Number(total))) return "—";
  // Node 22+ accepts decimal strings at runtime without rounding through Number.
  if (!currency) return clean(total) + " (currency not set)";
  try {
    return new Intl.NumberFormat("en-IE", { currency, style: "currency" }).format(
      total as unknown as number,
    );
  } catch {
    return `${clean(total)} ${clean(currency)}`;
  }
}
export function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return clean(value);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: date.getUTCFullYear() === new Date().getUTCFullYear() ? undefined : "numeric",
    timeZone: "UTC",
  }).format(date);
}
export function printSuccess(message: string) {
  const u = createUI();
  u.text(message, u.accent);
}
export function printWarning(message?: string) {
  if (message) console.error(`Warning: ${clean(message)}`);
}
export function printTable(headers: string[], rows: string[][], rightColumns: number[] = []) {
  const u = createUI();
  if (!rows.length) {
    u.text("Nothing here yet.", u.muted);
    return;
  }
  const safe = rows.map((row) => headers.map((_, i) => clean(row[i])));
  const widths = headers.map((header, i) =>
    Math.max(stringWidth(header), ...safe.map((row) => stringWidth(row[i]))),
  );
  if (widths.reduce((a, b) => a + b, 0) + (headers.length - 1) * 2 > u.available) {
    for (const row of safe) {
      u.text(row[0], u.c.bold);
      headers.slice(1).forEach((header, i) => u.field(header, row[i + 1]));
      u.line();
    }
    return;
  }
  const cells = (row: string[]) =>
    row
      .map((cell, i) =>
        rightColumns.includes(i)
          ? " ".repeat(widths[i] - stringWidth(cell)) + cell
          : fit(cell, widths[i]),
      )
      .join("  ");
  u.line(u.muted(cells(headers.map((h) => clean(h)))));
  safe.forEach((row) => u.line(cells(row)));
}
export function printPagination(
  pagination: Pagination,
  shown: number,
  command: string,
  all = false,
) {
  const u = createUI();
  u.hint(
    `${shown} shown · ${pagination.total} matching · ${all ? "all pages" : `page ${pagination.page}`}`,
  );
  if (!all && pagination.page * pagination.perPage < pagination.total)
    u.hint(`More → ${command} --page ${pagination.page + 1} · keep your filters, or use --all`);
}
