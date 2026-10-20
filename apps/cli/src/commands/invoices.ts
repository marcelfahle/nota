import { writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { Command, Option } from "commander";
import type { InvoiceCreateInput, InvoiceDetail, InvoiceStatus, NotaClient } from "@nota-app/sdk";
import { parseLineItem } from "../line-items.js";
import {
  getDefaultInvoiceDates,
  promptForClient,
  requireClient,
  resolveClientReference,
  resolveInvoiceReference,
} from "../helpers.js";
import {
  approve,
  collectPages,
  interactive,
  options,
  paginationOptions,
  promptContext,
  promptTheme,
  requireInput,
  type ListOptions,
} from "../interaction.js";
import { printInvoiceDetail, printInvoiceList } from "../output/invoices.js";
import {
  createUI,
  emit,
  formatCurrency,
  printPagination,
  printSuccess,
  printWarning,
} from "../output/shared.js";

type CreateOptions = {
  client?: string;
  currency?: string;
  dueAt?: string;
  internalNote?: string;
  issuedAt?: string;
  item?: string[];
  note?: string;
  reverseCharge?: boolean;
  taxRate?: string;
  dryRun?: boolean;
};
type Filters = ListOptions & { client?: string; status?: InvoiceStatus };
function filterOptions(command: Command) {
  return paginationOptions(command)
    .addOption(
      new Option("--status <status>").choices(["draft", "sent", "paid", "overdue", "cancelled"]),
    )
    .option("--client <client>", "Client ID or name");
}
async function buildInvoiceInput(
  client: NotaClient,
  opts: CreateOptions,
): Promise<InvoiceCreateInput> {
  const defaults = getDefaultInvoiceDates();
  const record = opts.client
    ? await resolveClientReference(client, opts.client)
    : await promptForClient(client);
  const lineItems = opts.item?.length ? opts.item.map(parseLineItem) : [];
  if (!lineItems.length) {
    requireInput("--item 'Development, 40hrs at 120'");
    const { input, confirm } = await import("@inquirer/prompts");
    do {
      const value = await input(
        {
          message: "Line item",
          theme: promptTheme(),
          validate: (value) => {
            try {
              parseLineItem(value);
              return true;
            } catch (error) {
              return (error as Error).message;
            }
          },
        },
        promptContext,
      );
      lineItems.push(parseLineItem(value));
    } while (
      await confirm(
        { message: "Add another item?", default: false, theme: promptTheme() },
        promptContext,
      )
    );
  }
  const issuedAt = opts.issuedAt?.trim() || defaults.issuedAt;
  const dueAt = opts.dueAt?.trim() || defaults.dueAt;
  for (const date of [issuedAt, dueAt])
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date
    )
      throw new Error("Use valid dates in YYYY-MM-DD format.");
  if (dueAt < issuedAt) throw new Error("Due date must be on or after the issue date.");
  const taxRate = opts.taxRate === undefined ? 0 : Number(opts.taxRate);
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100)
    throw new Error("Tax rate must be between 0 and 100.");
  return {
    clientId: record.id,
    currency: opts.currency?.trim().toUpperCase() || record.defaultCurrency || "EUR",
    dueAt,
    issuedAt,
    internalNotes: opts.internalNote,
    lineItems,
    notes: opts.note,
    reverseCharge: Boolean(opts.reverseCharge),
    taxRate,
  };
}
async function listInvoices(opts: Filters) {
  const client = await requireClient();
  const clientId = opts.client ? (await resolveClientReference(client, opts.client)).id : undefined;
  const result = await collectPages(
    (page, perPage) => client.listInvoices({ clientId, status: opts.status, page, perPage }),
    opts,
  );
  emit(result, () => {
    printInvoiceList(result.data);
    printPagination(result.pagination, result.data.length, "nota invoices", opts.all);
  });
}
function mutationResult(action: string, result: { invoice: InvoiceDetail; warning?: string }) {
  emit(result, () => {
    printSuccess(
      `${action} ${result.invoice.number} · ${formatCurrency(result.invoice.total, result.invoice.currency)}`,
    );
    printWarning(result.warning);
  });
}
export function registerInvoiceCommands(program: Command) {
  const invoices = filterOptions(
    program.command("invoices").alias("invoice").description("List, draft and manage invoices"),
  );
  invoices.action(async (_opts, command) => listInvoices(options<Filters>(command)));
  filterOptions(invoices.command("list").alias("ls").description("List invoices")).action(
    async (_opts, command) => listInvoices(options<Filters>(command)),
  );
  invoices
    .command("show")
    .argument("<invoice>")
    .description("Show an invoice")
    .option("--activity", "Include activity history")
    .action(async (reference: string, _opts, command) => {
      const client = await requireClient();
      const invoice = await resolveInvoiceReference(client, reference);
      emit(invoice, () => {
        printInvoiceDetail(invoice);
        if (options<{ activity?: boolean }>(command).activity) {
          const u = createUI();
          u.heading("Activity");
          for (const entry of invoice.activityLog) u.field(entry.createdAt, entry.action);
        }
      });
    });
  invoices
    .command("create")
    .alias("new")
    .description("Create a draft; never sends email")
    .option("--client <client>", "Client ID or name")
    .option("--currency <currency>")
    .option("--issued-at <date>")
    .option("--due-at <date>")
    .option("--note <text>")
    .option("--internal-note <text>")
    .option("--tax-rate <rate>")
    .option("--reverse-charge")
    .option("--dry-run", "Review inputs without saving")
    .option(
      "--item <item>",
      "e.g. 'Development, 40hrs at 120' (repeatable)",
      (value, items: string[]) => [...items, value],
      [],
    )
    .action(async (_opts, command) => {
      const opts = options<CreateOptions>(command);
      if (!opts.client || !opts.item?.length) requireInput("--client and at least one --item");
      const client = await requireClient();
      const payload = await buildInvoiceInput(client, opts);
      const me = await client.getMe();
      const review = () => {
        const u = createUI();
        u.heading("New draft");
        u.field("Workspace", me.org.businessName || me.org.name);
        u.field("Client", opts.client || payload.clientId);
        u.field("Dates", `${payload.issuedAt} → ${payload.dueAt}`);
        u.field(
          "Currency / tax",
          `${payload.currency} · ${payload.taxRate}%${payload.reverseCharge ? " · reverse charge" : ""}`,
        );
        for (const item of payload.lineItems)
          u.text(
            `${item.description} · ${item.quantity} × ${formatCurrency(String(item.unitPrice), payload.currency)}`,
          );
        u.hint("Totals are calculated by Nota when the draft is saved. No email is sent.");
      };
      if (opts.dryRun) return emit({ dryRun: true, workspace: me.org, input: payload }, review);
      if (interactive()) {
        review();
        if (!(await approve("Save draft?")))
          return emit({ cancelled: true }, () => printSuccess("Cancelled · no draft saved."));
      }
      const result = await client.createInvoice(payload);
      emit(result, () => {
        printInvoiceDetail(result.invoice);
        printWarning(result.warning);
      });
    });
  for (const action of ["send", "paid", "duplicate"] as const) {
    invoices
      .command(action)
      .argument("<invoice>")
      .description(
        {
          send: "Review and send an invoice",
          paid: "Record the remaining balance as paid",
          duplicate: "Duplicate as a new draft",
        }[action],
      )
      .option("--dry-run", "Review without making changes")
      .action(async (reference: string, _opts, command) => {
        const client = await requireClient();
        const invoice = await resolveInvoiceReference(client, reference);
        const me = await client.getMe();
        if (action === "send" && invoice.status !== "draft")
          throw new Error(
            "Only a draft can be sent. Use nota invoices show to inspect its current state.",
          );
        const review = () => {
          const u = createUI();
          u.heading(
            `${{ send: "Send invoice", paid: "Record payment", duplicate: "Duplicate draft" }[action]} · ${invoice.number}`,
          );
          u.field("Workspace", me.org.businessName || me.org.name);
          u.field("Client", invoice.client?.name || "Unknown client");
          u.field("Recipient", invoice.client?.email || "No email set");
          u.field(
            action === "paid" ? "Balance" : "Total",
            formatCurrency(action === "paid" ? invoice.balance : invoice.total, invoice.currency),
          );
          u.hint(
            {
              send: "Queues an email to this client with the invoice PDF.",
              paid: "Records a payment; does not charge a card or move money.",
              duplicate: "Creates a new draft with a new invoice number. No email.",
            }[action],
          );
        };
        const snapshot = { dryRun: true, action, workspace: me.org, invoice };
        if (options<{ dryRun?: boolean }>(command).dryRun) return emit(snapshot, review);
        if (interactive()) review();
        if (
          !(await approve(
            {
              send: "Send this invoice?",
              paid: "Record this balance as paid?",
              duplicate: "Create the duplicate draft?",
            }[action],
          ))
        )
          return emit({ cancelled: true }, () => printSuccess("Cancelled · no changes made."));
        // Detect edits while the user reviewed the prompt; server validation and send deduplication remain authoritative.
        const fresh = await client.getInvoice(invoice.id);
        const fingerprint = (i: InvoiceDetail) =>
          JSON.stringify([
            i.updatedAt,
            i.status,
            i.client,
            i.total,
            i.balance,
            i.dueAt,
            i.issuedAt,
            i.taxRate,
            i.notes,
            i.lineItems,
          ]);
        if (fingerprint(fresh) !== fingerprint(invoice))
          throw new Error(
            "Invoice changed during review. Run the command again to review the current version.",
          );
        const result =
          action === "send"
            ? await client.sendInvoice(invoice.id)
            : action === "paid"
              ? await client.markInvoicePaid(invoice.id)
              : await client.duplicateInvoice(invoice.id);
        mutationResult(
          { send: "Email queued for", paid: "Recorded payment for", duplicate: "Created draft" }[
            action
          ],
          result,
        );
      });
  }
  invoices
    .command("pdf")
    .argument("<invoice>")
    .description("Download invoice PDF")
    .option("--output <path>")
    .option("--force", "Replace an existing local file")
    .action(async (reference: string, _opts, command) => {
      const opts = options<{ output?: string; force?: boolean }>(command);
      const client = await requireClient();
      const invoice = await resolveInvoiceReference(client, reference);
      const download = await client.downloadPdf(invoice.id);
      const outputPath =
        opts.output?.trim() || basename(download.filename || `${invoice.number}.pdf`);
      await writeFile(outputPath, download.data, { flag: opts.force ? "w" : "wx" });
      emit({ invoiceId: invoice.id, path: outputPath, bytes: download.data.byteLength }, () =>
        printSuccess(`Saved ${invoice.number} → ${outputPath}`),
      );
    });
}
