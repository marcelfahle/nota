import { readFile } from "node:fs/promises";
import type { Command } from "commander";

import type { ClientCreateInput, TaxIdentifierInput } from "@nota-app/sdk";

import {
  interactive,
  requireInput,
  promptContext,
  promptTheme,
  collectPages,
  paginationOptions,
  type ListOptions,
} from "../interaction.js";
import { requireClient, resolveClientReference } from "../helpers.js";
import { printClientDetail, printClientList } from "../output/clients.js";
import { emit, printPagination, printSuccess, printTable } from "../output/shared.js";

async function buildClientInput(options: {
  address?: string;
  company?: string;
  currency?: string;
  email?: string;
  name?: string;
  notes?: string;
  taxId?: string;
  taxIdType?: TaxIdentifierInput["type"];
  vatNumber?: string;
}): Promise<ClientCreateInput> {
  if (!options.name?.trim() || !options.email?.trim()) requireInput("--name and --email");
  const { input } = await import("@inquirer/prompts");
  const isFullyInteractive = interactive() && !options.name && !options.email;
  const name =
    options.name?.trim() ||
    (await input({ message: "Client name", theme: promptTheme() }, promptContext)).trim();
  const email =
    options.email?.trim() ||
    (await input({ message: "Client email", theme: promptTheme() }, promptContext)).trim();

  if (!name || !email) {
    throw new Error("Client name and email are required.");
  }

  const company =
    options.company?.trim() ||
    (isFullyInteractive
      ? (await input({ message: "Company (optional)", theme: promptTheme() }, promptContext)).trim()
      : "");
  const address =
    options.address?.trim() ||
    (isFullyInteractive
      ? (await input({ message: "Address (optional)", theme: promptTheme() }, promptContext)).trim()
      : "");
  const defaultCurrency =
    options.currency?.trim() ||
    (isFullyInteractive
      ? (
          await input({ default: "EUR", message: "Currency", theme: promptTheme() }, promptContext)
        ).trim()
      : "EUR");
  const notes =
    options.notes?.trim() ||
    (isFullyInteractive ? (await input({ message: "Notes (optional)", theme: promptTheme() }, promptContext)).trim() : "");
  const taxId =
    options.taxId?.trim() ||
    options.vatNumber?.trim() ||
    (isFullyInteractive ? (await input({ message: "Tax identifier (optional)", theme: promptTheme() }, promptContext)).trim() : "");
  const taxIdType =
    options.taxIdType ??
    (options.vatNumber
      ? "eu_vat"
      : taxId && isFullyInteractive
        ? ((await input({
            default: "tax_id",
            message: "Tax identifier type (eu_vat, us_ein, tax_id)",
            theme: promptTheme(),
          }, promptContext)) as TaxIdentifierInput["type"])
        : "tax_id");

  return {
    address: address || undefined,
    company: company || undefined,
    defaultCurrency: defaultCurrency || "EUR",
    email,
    name,
    notes: notes || undefined,
    taxIdentifier: taxId ? { type: taxIdType, value: taxId } : undefined,
  };
}

function getCommandOptions(args: Array<unknown>) {
  const command = args.at(-1);
  if (!command || typeof command !== "object" || !("optsWithGlobals" in command)) {
    return {};
  }

  return typeof command.optsWithGlobals === "function" ? command.optsWithGlobals() : {};
}

async function listClientsCommand(options: ListOptions & { search?: string }) {
  const client = await requireClient();
  const result = await collectPages(
    (page, perPage) => client.listClients({ search: options.search, page, perPage }),
    options,
  );
  emit(result, () => {
    printClientList(result.data);
    printPagination(result.pagination, result.data.length, "nota clients", options.all);
  });
}

export function registerClientCommands(program: Command) {
  const clients = paginationOptions(
    program.command("clients").alias("client").description("Manage clients"),
  );

  clients
    .command("import")
    .argument("<file>", "UTF-8 client CSV")
    .description("Preview a client CSV; import only with the reviewed preview hash")
    .option("--confirm <hash>", "Import the exact reviewed preview")
    .action(async (file: string, options: { confirm?: string }) => {
      const client = await requireClient();
      const csv = await readFile(file, "utf8");
      if (options.confirm) {
        const result = await client.importClientsCsv(csv, options.confirm);
        emit(result, () =>
          printSuccess(
            `Added ${result.added} clients; skipped ${result.counts.duplicate} duplicates and ${result.counts.invalid} invalid rows.`,
          ),
        );
        return;
      }
      const preview = await client.previewClientsCsv(csv);
      emit(preview, () => {
        printTable(
          ["Line", "Name", "Email", "Action", "Reason"],
          preview.rows.map((row) => [
            String(row.line),
            row.client.name ?? "",
            row.client.email ?? "",
            row.status,
            row.reason ?? "",
          ]),
        );
        printSuccess(`${preview.counts.ready} clients ready. Preview hash: ${preview.hash}`);
        printSuccess(
          "After reviewing, rerun with --confirm <hash> to add them. Existing clients stay intact.",
        );
      });
    });

  clients
    .option("--search <query>", "Filter by name, email, or company")
    .action(async (...args) => {
      await listClientsCommand(getCommandOptions(args));
    });

  paginationOptions(clients.command("list"))
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
      emit({ client: record, recentInvoices }, () =>
        printClientDetail(record, recentInvoices.data),
      );
    });

  clients
    .command("create")
    .alias("new")
    .description("Create a client")
    .option("--name <name>")
    .option("--email <email>")
    .option("--company <company>")
    .option("--address <address>")
    .option("--currency <currency>")
    .option("--tax-id <taxId>")
    .option("--tax-id-type <taxIdType>", "eu_vat, us_ein, or tax_id")
    .option("--vat-number <vatNumber>", "Deprecated alias for an EU VAT ID")
    .option("--notes <notes>")
    .action(async (...args) => {
      const client = await requireClient();
      const payload = await buildClientInput(getCommandOptions(args));
      const createdClient = await client.createClient(payload);
      emit(createdClient, () =>
        printSuccess(`Created ${createdClient.name} · ${createdClient.email}`),
      );
    });
}
