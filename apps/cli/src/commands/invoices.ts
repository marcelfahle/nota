import { writeFile } from "node:fs/promises";

import { confirm, input, number } from "@inquirer/prompts";
import { Command, Option } from "commander";

import type {
  InvoiceCreateInput,
  InvoiceDetail,
  InvoiceLineItemInput,
  InvoiceStatus,
  NotaClient,
} from "@nota-app/sdk";

import { parseLineItem } from "../line-items.js";
import {
  getDefaultInvoiceDates,
  promptForClient,
  requireClient,
  resolveClientReference,
  resolveInvoiceReference,
} from "../helpers.js";
import { printInvoiceDetail, printInvoiceList } from "../output/invoices.js";
import { formatCurrency, printSuccess, printWarning } from "../output/shared.js";

async function promptForLineItems() {
  const items: Array<InvoiceLineItemInput> = [];

  do {
    const description = (await input({ message: "Line item description" })).trim();
    if (!description) {
      throw new Error("Line item description is required.");
    }

    const quantity = await number({ message: "Quantity", required: true });
    const unitPrice = await number({ message: "Unit price", required: true });

    if (!quantity || quantity <= 0 || unitPrice === undefined || unitPrice < 0) {
      throw new Error("Line item quantity and unit price must be valid numbers.");
    }

    items.push({ description, quantity, unitPrice });
  } while (await confirm({ default: false, message: "Add another line item?" }));

  return items;
}

async function buildInvoiceInput(
  client: NotaClient,
  options: {
    client?: string;
    currency?: string;
    dueAt?: string;
    internalNote?: string;
    issuedAt?: string;
    item?: Array<string>;
    note?: string;
    reverseCharge?: boolean;
    taxRate?: string;
  },
): Promise<InvoiceCreateInput> {
  const defaults = getDefaultInvoiceDates();
  const resolvedClient = options.client
    ? await resolveClientReference(client, options.client)
    : await promptForClient(client);

  const lineItems = options.item?.length
    ? options.item.map((value) => parseLineItem(value))
    : await promptForLineItems();

  const issuedAt = options.issuedAt?.trim() || defaults.issuedAt;
  const dueAt = options.dueAt?.trim() || defaults.dueAt;
  const taxRate = options.taxRate ? Number(options.taxRate) : 0;

  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
    throw new Error("Tax rate must be between 0 and 100.");
  }

  return {
    clientId: resolvedClient.id,
    currency: options.currency?.trim() || resolvedClient.defaultCurrency || "EUR",
    dueAt,
    internalNotes: options.internalNote,
    issuedAt,
    lineItems,
    notes: options.note,
    reverseCharge: Boolean(options.reverseCharge),
    taxRate,
  };
}

function getCommandOptions(args: Array<unknown>) {
  const command = args.at(-1);
  if (!command || typeof command !== "object" || !("opts" in command)) {
    return {};
  }

  return typeof command.opts === "function" ? command.opts() : {};
}

function printInvoiceMutationResult(action: string, invoice: InvoiceDetail, warning?: string) {
  printSuccess(`${action} ${invoice.number} (${formatCurrency(invoice.total, invoice.currency)}).`);
  printWarning(warning);
}

async function listInvoicesCommand(options: { client?: string; status?: InvoiceStatus }) {
  const client = await requireClient();
  const filters: { clientId?: string; status?: InvoiceStatus } = {};

  if (options.status) {
    filters.status = options.status;
  }

  if (options.client) {
    filters.clientId = (await resolveClientReference(client, options.client)).id;
  }

  const result = await client.listInvoices(filters);
  printInvoiceList(result.data);
}

export function registerInvoiceCommands(program: Command) {
  const invoices = program.command("invoices").description("Manage invoices");

  invoices.action(async () => {
    await listInvoicesCommand({});
  });

  invoices
    .command("list")
    .alias("ls")
    .description("List invoices")
    .addOption(
      new Option("--status <status>").choices(["draft", "sent", "paid", "overdue", "cancelled"]),
    )
    .option("--client <client>", "Filter by client ID or exact name")
    .action(async (...args) => {
      await listInvoicesCommand(getCommandOptions(args));
    });

  invoices
    .command("show")
    .argument("<invoice>")
    .description("Show an invoice by ID or number")
    .action(async (reference: string) => {
      const client = await requireClient();
      const invoice = await resolveInvoiceReference(client, reference);
      printInvoiceDetail(invoice);
    });

  invoices
    .command("create")
    .description("Create an invoice")
    .option("--client <client>", "Client ID or exact name")
    .option("--currency <currency>")
    .option("--issued-at <date>")
    .option("--due-at <date>")
    .option("--note <text>")
    .option("--internal-note <text>")
    .option("--tax-rate <rate>")
    .option("--reverse-charge")
    .option(
      "--item <item>",
      "Natural line item text",
      (value, items: Array<string>) => {
        items.push(value);
        return items;
      },
      [],
    )
    .action(async (...args) => {
      const client = await requireClient();
      const payload = await buildInvoiceInput(client, getCommandOptions(args));
      const result = await client.createInvoice(payload);
      printInvoiceMutationResult("Created", result.invoice, result.warning);
    });

  invoices
    .command("send")
    .argument("<invoice>")
    .description("Send an invoice")
    .action(async (reference: string) => {
      const client = await requireClient();
      const invoice = await resolveInvoiceReference(client, reference);
      const result = await client.sendInvoice(invoice.id);
      printInvoiceMutationResult("Sent", result.invoice, result.warning);
    });

  invoices
    .command("paid")
    .argument("<invoice>")
    .description("Mark an invoice as paid")
    .action(async (reference: string) => {
      const client = await requireClient();
      const invoice = await resolveInvoiceReference(client, reference);
      const result = await client.markInvoicePaid(invoice.id);
      printInvoiceMutationResult("Marked paid", result.invoice, result.warning);
    });

  invoices
    .command("duplicate")
    .argument("<invoice>")
    .description("Duplicate an invoice")
    .action(async (reference: string) => {
      const client = await requireClient();
      const invoice = await resolveInvoiceReference(client, reference);
      const result = await client.duplicateInvoice(invoice.id);
      printInvoiceMutationResult("Duplicated", result.invoice, result.warning);
    });

  invoices
    .command("pdf")
    .argument("<invoice>")
    .description("Download invoice PDF")
    .option("--output <path>")
    .action(async (reference: string, options: { output?: string }) => {
      const client = await requireClient();
      const invoice = await resolveInvoiceReference(client, reference);
      const download = await client.downloadPdf(invoice.id);
      const outputPath = options.output?.trim() || download.filename || `${invoice.number}.pdf`;
      await writeFile(outputPath, download.data);
      printSuccess(`Saved ${invoice.number} PDF to ${outputPath}.`);
    });
}
