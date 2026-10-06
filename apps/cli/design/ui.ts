import { stripVTControlCharacters } from "node:util";
import chalk, { Chalk } from "chalk";
import stringWidth from "string-width";
import { today, type DemoInvoice } from "./data.js";

export function clean(value: string) {
  return stripVTControlCharacters(value).replace(/[\x00-\x1f\x7f-\x9f]/g, " ");
}

const segments = new Intl.Segmenter("en", { granularity: "grapheme" });
export function wrap(value: string, width: number) {
  const lines: string[] = [];
  let line = "";
  for (const { segment } of segments.segment(clean(value))) {
    if (stringWidth(line + segment) > width && line) {
      lines.push(line.trimEnd());
      line = "";
    }
    line += segment;
  }
  if (line) lines.push(line.trimEnd());
  return lines;
}

export function fit(value: string, width: number) {
  const safe = clean(value);
  if (stringWidth(safe) <= width) return safe + " ".repeat(width - stringWidth(safe));
  let result = "";
  for (const { segment } of segments.segment(safe)) {
    if (stringWidth(result + segment) > width - 1) break;
    result += segment;
  }
  return result + "…" + " ".repeat(Math.max(0, width - stringWidth(result) - 1));
}

export function money(cents: number) {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(cents / 100);
}

export function dueLabel(invoice: DemoInvoice) {
  if (invoice.status === "paid") return "Settled";
  const days = Math.round((Date.parse(invoice.due) - Date.parse(today)) / 86400000);
  if (invoice.status === "overdue" && days < 0) return `${-days}d overdue`;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(invoice.due));
}

export function createUI(
  width = process.stdout.columns || 88,
  noColor = false,
  write = (line: string) => console.log(line),
) {
  const c = new Chalk({
    level: noColor || "NO_COLOR" in process.env || process.env.TERM === "dumb" ? 0 : chalk.level,
  });
  const accent = c.hex("#d1fd39");
  const muted = c.gray;
  const available = Math.min(width, 96) - 4;
  const line = (value = "") => write(value ? `  ${value}` : "");
  const text = (value: string, style: (s: string) => string = (s) => s) =>
    wrap(value, available).forEach((part) => line(style(part)));
  const hint = (value: string) => {
    line();
    text(value, muted);
  };
  const heading = (value: string) => {
    line();
    text(value, c.bold);
    line();
  };
  const rule = () => line(muted("─".repeat(available)));
  const field = (label: string, value: string) => {
    if (available < 50) {
      text(label, muted);
      text(value);
    } else
      wrap(value, available - 18).forEach((part, i) =>
        line(`${muted(i === 0 ? fit(label, 18) : " ".repeat(18))}${part}`),
      );
  };
  const status = (value: DemoInvoice["status"]) =>
    ({ draft: muted, sent: c.cyan, overdue: c.yellow, paid: accent })[value](value);
  const brand = () => {
    line();
    line(`${accent.bold("nota")}${muted(" / terminal preview")}`);
    text("Sample workspace · 05 Oct 2026", muted);
    line();
  };
  const list = (rows: DemoInvoice[]) => {
    if (!rows.length) {
      text("No invoices match this view.");
      hint("Try nota invoices, or create a draft with nota invoices create.");
      return;
    }
    if (available < 74) {
      for (const invoice of rows) {
        text(invoice.number, c.bold);
        text(invoice.client);
        text(
          `${money(invoice.total)} · ${invoice.status}`,
          invoice.status === "overdue" ? c.yellow : (s) => s,
        );
        text(`Due ${invoice.due} · ${dueLabel(invoice)}`, muted);
        line();
      }
      return;
    }
    const clientWidth = available - 54;
    line(
      muted(
        `${fit("INVOICE", 11)}  ${fit("CLIENT", clientWidth)}  ${"AMOUNT".padStart(12)}  ${fit("STATUS", 9)}  DUE`,
      ),
    );
    line();
    for (const invoice of rows) {
      line(
        `${c.bold(fit(invoice.number, 11))}  ${fit(invoice.client, clientWidth)}  ${money(invoice.total).padStart(12)}  ${status(invoice.status)}${" ".repeat(9 - invoice.status.length)}  ${dueLabel(invoice)}`,
      );
    }
  };
  const detail = (invoice: DemoInvoice) => {
    heading(`${invoice.number} / ${invoice.status}`);
    field("Client", invoice.client);
    field("Recipient", invoice.email);
    field("Due", invoice.due);
    line();
    rule();
    for (const item of invoice.items) {
      line();
      text(item.description, c.bold);
      field(`${item.quantity} × ${money(item.rate)}`, money(item.amount));
    }
    line();
    rule();
    line();
    field("Tax", "€0.00 · sample uses 0% tax");
    field("Total", money(invoice.total));
    if (invoice.status !== "draft") field("Balance due", money(invoice.balance));
    if (invoice.status === "draft") hint("Draft · nothing has been sent.");
    else if (invoice.balance > 0 && invoice.balance < invoice.total)
      hint("Partially paid · the balance reflects payments received.");
  };
  return { c, accent, muted, line, text, hint, heading, rule, field, brand, list, detail };
}
