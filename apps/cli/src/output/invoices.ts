import type { InvoiceDetail, InvoiceSummary } from "@nota-app/sdk";

import { formatCurrency, printTable } from "./shared.js";

export function printInvoiceList(invoices: Array<InvoiceSummary>) {
  printTable(
    ["Number", "Client", "Amount", "Status", "Due"],
    invoices.map((invoice) => [
      invoice.number,
      invoice.client?.name ?? invoice.client?.email ?? "Unknown client",
      formatCurrency(invoice.total, invoice.currency),
      invoice.status,
      invoice.dueAt,
    ]),
  );
}

export function printInvoiceDetail(invoice: InvoiceDetail) {
  console.log(invoice.number);
  console.log(`Status: ${invoice.status}`);
  console.log(`Client: ${invoice.client?.name ?? "Unknown client"}`);
  console.log(`Issued: ${invoice.issuedAt}`);
  console.log(`Due: ${invoice.dueAt}`);
  if (invoice.notes) {
    console.log(`Notes: ${invoice.notes}`);
  }
  if (invoice.internalNotes) {
    console.log(`Internal notes: ${invoice.internalNotes}`);
  }
  console.log(`Total: ${formatCurrency(invoice.total, invoice.currency)}`);
  console.log("");
  console.log("Line items");
  printTable(
    ["Description", "Qty", "Unit", "Amount"],
    invoice.lineItems.map((item) => [
      item.description,
      item.quantity,
      formatCurrency(item.unitPrice, invoice.currency),
      formatCurrency(item.amount, invoice.currency),
    ]),
  );
  if (invoice.activityLog.length > 0) {
    console.log("");
    console.log("Activity");
    for (const entry of invoice.activityLog) {
      console.log(`- ${entry.createdAt}: ${entry.action}`);
    }
  }
}
