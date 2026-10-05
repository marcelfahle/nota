import type { ClientRecord, InvoiceSummary } from "@nota-app/sdk";
import { createUI, printTable } from "./shared.js";
import { printInvoiceList } from "./invoices.js";
export function printClientList(clients: ClientRecord[]) {
  const u = createUI();
  u.heading("Clients");
  if (!clients.length) {
    u.text("No clients match this view.");
    u.hint("Add your first client → nota clients create");
    return;
  }
  printTable(
    ["NAME", "EMAIL", "COMPANY", "INVOICES"],
    clients.map((client) => [
      client.name,
      client.email,
      client.company || "—",
      String(client.invoiceCount ?? 0),
    ]),
    [3],
  );
}
export function printClientDetail(client: ClientRecord, recentInvoices: InvoiceSummary[]) {
  const u = createUI();
  u.heading(client.name);
  u.field("Email", client.email);
  if (client.company) u.field("Company", client.company);
  if (client.address) u.field("Address", client.address);
  if (client.vatNumber) u.field("VAT", client.vatNumber);
  u.field("Default currency", client.defaultCurrency || "Not set");
  u.field("Invoices", String(client.invoiceCount ?? 0));
  // The client aggregate has no currency breakdown; do not label a mixed-currency total as its default currency.
  if (client.notes) {
    u.heading("Notes");
    u.text(client.notes);
  }
  printInvoiceList(recentInvoices, "Recent invoices · up to 5");
  u.line();
}
