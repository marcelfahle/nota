import { input } from "@inquirer/prompts";
import type { Command } from "commander";

import type { ClientCreateInput } from "@nota-app/sdk";

import { requireClient, resolveClientReference } from "../helpers.js";
import { printClientDetail, printClientList } from "../output/clients.js";
import { printSuccess } from "../output/shared.js";

async function buildClientInput(options: {
  address?: string;
  company?: string;
  currency?: string;
  email?: string;
  name?: string;
  notes?: string;
  vatNumber?: string;
}): Promise<ClientCreateInput> {
  const isFullyInteractive = Object.values(options).every((value) => value === undefined);
  const name = options.name?.trim() || (await input({ message: "Client name" })).trim();
  const email = options.email?.trim() || (await input({ message: "Client email" })).trim();

  if (!name || !email) {
    throw new Error("Client name and email are required.");
  }

  const company =
    options.company?.trim() ||
    (isFullyInteractive ? (await input({ message: "Company (optional)" })).trim() : "");
  const address =
    options.address?.trim() ||
    (isFullyInteractive ? (await input({ message: "Address (optional)" })).trim() : "");
  const defaultCurrency =
    options.currency?.trim() ||
    (isFullyInteractive ? (await input({ default: "EUR", message: "Currency" })).trim() : "EUR");
  const notes =
    options.notes?.trim() ||
    (isFullyInteractive ? (await input({ message: "Notes (optional)" })).trim() : "");
  const vatNumber =
    options.vatNumber?.trim() ||
    (isFullyInteractive ? (await input({ message: "VAT number (optional)" })).trim() : "");

  return {
    address: address || undefined,
    company: company || undefined,
    defaultCurrency: defaultCurrency || "EUR",
    email,
    name,
    notes: notes || undefined,
    vatNumber: vatNumber || undefined,
  };
}

function getCommandOptions(args: Array<unknown>) {
  const command = args.at(-1);
  if (!command || typeof command !== "object" || !("opts" in command)) {
    return {};
  }

  return typeof command.opts === "function" ? command.opts() : {};
}

async function listClientsCommand(options: { search?: string }) {
  const client = await requireClient();
  const result = await client.listClients({ search: options.search });
  printClientList(result.data);
}

export function registerClientCommands(program: Command) {
  const clients = program.command("clients").description("Manage clients");

  clients.option("--search <query>", "Filter by name, email, or company").action(async (...args) => {
    await listClientsCommand(getCommandOptions(args));
  });

  clients
    .command("list")
    .alias("ls")
    .description("List clients")
    .option("--search <query>", "Filter by name, email, or company")
    .action(async (...args) => {
      await listClientsCommand(getCommandOptions(args));
    });

  clients
    .command("show")
    .argument("<client>")
    .description("Show a client by ID or exact name")
    .action(async (reference: string) => {
      const client = await requireClient();
      const record = await resolveClientReference(client, reference);
      const recentInvoices = await client.listInvoices({ clientId: record.id, perPage: 5 });
      printClientDetail(record, recentInvoices.data);
    });

  clients
    .command("create")
    .description("Create a client")
    .option("--name <name>")
    .option("--email <email>")
    .option("--company <company>")
    .option("--address <address>")
    .option("--currency <currency>")
    .option("--vat-number <vatNumber>")
    .option("--notes <notes>")
    .action(async (...args) => {
      const client = await requireClient();
      const payload = await buildClientInput(getCommandOptions(args));
      const createdClient = await client.createClient(payload);
      printSuccess(`Created client ${createdClient.name} (${createdClient.email}).`);
    });
}
