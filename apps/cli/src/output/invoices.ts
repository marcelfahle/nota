import type { InvoiceDetail, InvoiceSummary } from "@nota-app/sdk";
import stringWidth from "string-width";
import { clean, fit, createUI, formatCurrency, formatDate, printTable } from "./shared.js";

export function printInvoiceList(invoices: InvoiceSummary[], title = "Invoices") {
  const u = createUI();
  u.heading(title);
  if (!invoices.length) {
    u.text("No invoices match this view.");
    u.hint("Create a draft → nota invoices create");
    return;
  }
  const rows = invoices.map((i) => [
    clean(i.number),
    clean(i.client?.name || i.client?.email || "Unknown client"),
    formatCurrency(i.total, i.currency),
    i.status === "sent" && Number(i.paidAmount) > 0 && Number(i.balance) > 0
      ? "part paid"
      : i.status,
    formatDate(i.dueAt),
  ]);
  const numberWidth = Math.max(7, ...rows.map((r) => stringWidth(r[0])));
  const amountWidth = Math.max(5, ...rows.map((r) => stringWidth(r[2])));
  const dateWidth = Math.max(3, ...rows.map((r) => stringWidth(r[4])));
  const clientWidth = Math.min(28, u.available - numberWidth - amountWidth - dateWidth - 9 - 8);
  if (clientWidth >= 12) {
    u.line(
      u.muted(
        `${fit("INVOICE", numberWidth)}  ${fit("CLIENT", clientWidth)}  ${"TOTAL".padStart(amountWidth)}  ${fit("STATUS", 9)}  DUE`,
      ),
    );
    for (const row of rows)
      u.line(
        `${fit(row[0], numberWidth)}  ${fit(row[1], clientWidth)}  ${" ".repeat(amountWidth - stringWidth(row[2])) + row[2]}  ${fit(row[3], 9)}  ${row[4]}`,
      );
  } else {
    for (const row of rows) {
      u.text(`${row[0]} · ${row[2]}`, u.c.bold);
      u.text(`${row[1]} · ${row[3]} · due ${row[4]}`, u.muted);
    }
  }
}
export function printInvoiceDetail(invoice: InvoiceDetail) {
  const u = createUI();
  u.heading(`${invoice.number} / ${invoice.status}`);
  u.field("Client", invoice.client?.name || "Unknown client");
  u.field("Recipient", invoice.client?.email || "No email set");
  u.field("Issued", formatDate(invoice.issuedAt));
  u.field("Due", formatDate(invoice.dueAt));
  u.line();
  printTable(
    ["ITEM", "QTY", "RATE", "AMOUNT"],
    invoice.lineItems.map((item) => [
      item.description,
      item.quantity,
      formatCurrency(item.unitPrice, invoice.currency),
      formatCurrency(item.amount, invoice.currency),
    ]),
    [1, 2, 3],
  );
  u.line();
  u.field("Subtotal", formatCurrency(invoice.subtotal, invoice.currency));
  u.field(
    "Tax",
    `${formatCurrency(invoice.taxAmount, invoice.currency)} · ${invoice.taxRate ?? "0"}%`,
  );
  if (invoice.reverseCharge === true || invoice.reverseCharge === "true")
    u.field("VAT treatment", "Reverse charge");
  u.field("Total", formatCurrency(invoice.total, invoice.currency));
  if (invoice.status !== "draft")
    u.field("Balance due", formatCurrency(invoice.balance, invoice.currency));
  if (invoice.settlementStatus === "partially_paid")
    u.hint("Partially paid · balance reflects recorded payments.");
  if (invoice.notes) {
    u.heading("Client note");
    u.text(invoice.notes);
  }
  if (invoice.internalNotes) {
    u.heading("Internal note · not on the invoice");
    u.text(invoice.internalNotes);
  }
  if (invoice.status === "draft")
    u.hint(
      `Draft · nothing sent. Review delivery → nota invoices send ${invoice.number} --dry-run`,
    );

  u.line();
}
