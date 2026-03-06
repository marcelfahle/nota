import type { ClientRecord, InvoiceSummary } from "@nota-app/sdk";

import { formatCurrency, printTable } from "./shared.js";
import { printInvoiceList } from "./invoices.js";

export function printClientList(clients: Array<ClientRecord>) {
  printTable(
    ["Name", "Email", "Company", "Invoices"],
    clients.map((client) => [
      client.name,
      client.email,
      client.company ?? "-",
      String(client.invoiceCount ?? 0),
    ]),
  );
}

export function printClientDetail(client: ClientRecord, recentInvoices: Array<InvoiceSummary>) {
  console.log(client.name);
  console.log(client.email);
  if (client.company) {
    console.log(client.company);
  }
  console.log(`Invoices: ${client.invoiceCount ?? 0}`);
  console.log(`Total invoiced: ${formatCurrency(client.totalInvoiced, client.defaultCurrency)}`);
  if (client.address) {
    console.log(`Address: ${client.address}`);
  }
  if (client.vatNumber) {
    console.log(`VAT: ${client.vatNumber}`);
  }
  if (client.notes) {
    console.log(`Notes: ${client.notes}`);
  }
  console.log("");
  console.log("Recent invoices");
  if (recentInvoices.length === 0) {
    console.log("No invoices yet.");
    return;
  }

  printInvoiceList(recentInvoices);
}
