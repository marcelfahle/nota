#!/usr/bin/env node

import { Command, CommanderError, InvalidArgumentError, Option } from "commander";
import { parseLineItem } from "../src/line-items.js";
import { clients, invoices, today, type DemoInvoice } from "./data.js";
import { clean, createUI, money } from "./ui.js";

const program = new Command();
program
  .name("nota")
  .description(
    "Invoices, without the busywork.\nOffline design preview · sample data · no account required.",
  )
  .version("0.1.0-preview")
  .option("--json", "Output sample data as JSON; never prompt")
  .option("--no-color", "Disable color")
  .option("--width <columns>", "Preview a terminal width (32–160)", (value) => {
    if (!/^\d+$/.test(value) || Number(value) < 32 || Number(value) > 160)
      throw new InvalidArgumentError("Choose a width between 32 and 160.");
    return Number(value);
  })
  .showSuggestionAfterError()
  .exitOverride();

const options = () => program.opts<{ json?: boolean; color?: boolean; width?: number }>();
const ui = () => createUI(options().width, options().color === false);
const json = (data: unknown) => console.log(JSON.stringify({ preview: true, data }, null, 2));
const interactive = () =>
  Boolean(process.stdin.isTTY && process.stderr.isTTY && !options().json && !process.env.CI);
const promptTheme = () => ({
  prefix: { idle: ui().accent("?"), done: ui().accent("✓") },
  style: { answer: ui().accent, highlight: ui().accent, message: (s: string) => ui().c.bold(s) },
});
const promptContext = { output: process.stderr };
// Configure before creating subcommands so they inherit the same error writer.
program.configureOutput({ writeErr: () => {} });
program.hook("preAction", () => {
  if (options().color === false || "NO_COLOR" in process.env || process.env.TERM === "dumb") {
    process.env.NO_COLOR = "1";
    delete process.env.FORCE_COLOR;
  }
});

function showHome() {
  const open = invoices.filter((i) => i.status === "sent" || i.status === "overdue");
  const overdue = open.filter((i) => i.status === "overdue");
  const data = {
    workspace: "Sample workspace",
    asOf: today,
    currency: "EUR",
    outstandingCents: open.reduce((sum, i) => sum + i.balance, 0),
    overdueCents: overdue.reduce((sum, i) => sum + i.balance, 0),
    draftCount: invoices.filter((i) => i.status === "draft").length,
  };
  if (options().json) return json(data);
  const u = ui();
  u.brand();
  u.text("Less admin. More making.", u.c.bold);
  u.heading("At a glance");
  u.field("Outstanding", `${money(data.outstandingCents)} · ${open.length} invoices`);
  u.field("Overdue", `${money(data.overdueCents)} · ${overdue.length} invoice`);
  u.field("Drafts", `${data.draftCount} ready to review`);
  u.hint("Outstanding includes overdue balances; drafts are excluded.");
  u.heading("Needs your attention");
  u.text("INV-0042 · Oxide Studio", u.c.bold);
  u.text("€4,800.00 · 7 days overdue", u.c.yellow);
  u.hint("Inspect  → nota invoices show INV-0042");
  u.heading("Pick up where you left off");
  u.field("Create a draft", "nota invoices create");
  u.field("All invoices", "nota invoices");
  u.field("Your clients", "nota clients");
  u.field("Find a command", "nota --help");
  u.hint("Preview only. No network, saved changes, or email.");
  u.line();
}

function findInvoice(reference: string) {
  const invoice = invoices.find((i) => i.number.toLowerCase() === reference.toLowerCase());
  if (!invoice)
    throw new Error(
      `Invoice '${clean(reference)}' was not found.\nTry nota invoices to see the sample invoices.`,
    );
  return invoice;
}

function listInvoices(filters: { status?: string; client?: string } = {}) {
  const rows = invoices.filter(
    (i) =>
      (!filters.status || i.status === filters.status) &&
      (!filters.client || i.client.toLowerCase().includes(filters.client.toLowerCase())),
  );
  if (options().json)
    return json({
      invoices: rows,
      pagination: { page: 1, perPage: rows.length, total: rows.length },
      currency: "EUR",
      moneyUnit: "cents",
    });
  const u = ui();
  u.brand();
  u.heading(`Invoices${filters.status ? ` / ${filters.status}` : ""}`);
  u.list(rows);
  if (rows.length)
    u.hint(
      `${rows.length} invoice${rows.length === 1 ? "" : "s"} · all matching sample invoices shown`,
    );
  u.hint("Inspect  → nota invoices show INV-0042");
  u.line();
}

function showInvoice(reference: string) {
  const invoice = findInvoice(reference);
  if (options().json) return json({ invoice, currency: "EUR", moneyUnit: "cents" });
  const u = ui();
  u.brand();
  u.detail(invoice);
  u.heading("Next step");
  u.text(
    invoice.status === "draft"
      ? `nota invoices send ${invoice.number} --dry-run`
      : `nota invoices pdf ${invoice.number}`,
  );
  if (invoice.status !== "draft")
    u.hint("PDF download is available in the existing CLI; this preview is offline.");
  u.line();
}

function reviewSend(invoice: DemoInvoice) {
  const u = ui();
  u.heading("Review delivery");
  u.field("Invoice", invoice.number);
  u.field("To", `${invoice.client} <${invoice.email}>`);
  u.field("Amount", money(invoice.total));
  u.field("Attachment", `${invoice.number}.pdf (sample)`);
  u.hint("In the live CLI, this would email the invoice to this recipient.");
  u.hint("This preview sends nothing.");
  u.line();
}

async function sendInvoice(reference: string, flags: { yes?: boolean; dryRun?: boolean }) {
  const invoice = findInvoice(reference);
  if (invoice.status !== "draft")
    throw new Error(
      `${invoice.number} is ${invoice.status}. Choose draft INV-0044 to preview sending.`,
    );
  if (flags.dryRun) {
    if (options().json)
      return json({ action: "send", dryRun: true, recipient: invoice.email, invoice });
    ui().brand();
    reviewSend(invoice);
    ui().text("Dry run complete. Nothing sent.", ui().accent);
    ui().line();
    return;
  }
  if (!flags.yes && !interactive())
    throw new Error(
      "Sending needs confirmation.\nReview with --dry-run, then use --yes to simulate sending without a prompt.",
    );
  if (!options().json) {
    ui().brand();
    reviewSend(invoice);
  }
  if (!flags.yes) {
    const { confirm } = await import("@inquirer/prompts");
    const approved = await confirm(
      { message: "Simulate sending this invoice?", default: false, theme: promptTheme() },
      promptContext,
    );
    if (!approved) {
      ui().hint("Cancelled. Nothing sent.");
      return;
    }
  }
  if (options().json)
    return json({
      action: "send",
      simulated: true,
      sent: false,
      invoice: invoice.number,
      recipient: invoice.email,
    });
  ui().text(`✓ Send simulated for ${invoice.number}.`, ui().accent);
  ui().hint("No email sent. Sample data resets on the next command.");
  ui().line();
}

async function createInvoice(flags: { client?: string; item: string[]; yes?: boolean }) {
  if (!interactive() && (!flags.client || !flags.item.length))
    throw new Error(
      'Creating a draft needs --client and --item when prompts are unavailable.\nTry: nota invoices create --client "Oxide Studio" --item "Development, 40hrs at 120" --yes',
    );
  const u = ui();
  if (!options().json) {
    u.brand();
    u.heading("Create a draft");
    u.text("Client → line items → review", u.muted);
    u.line();
  }
  let clientName = flags.client;
  if (!clientName) {
    const { select } = await import("@inquirer/prompts");
    clientName = await select(
      {
        message: "Who is this for?",
        choices: clients.map((c) => ({
          value: c.name,
          name: c.name,
          description: `${c.email} · ${c.currency}`,
        })),
        theme: promptTheme(),
      },
      promptContext,
    );
  }
  const client = clients.find((c) => c.name.toLowerCase() === clientName!.toLowerCase());
  if (!client)
    throw new Error(
      `Client '${clean(clientName)}' was not found.\nTry nota clients to see exact sample names.`,
    );
  const rawItems = [...flags.item];
  if (!rawItems.length) {
    const { input, confirm } = await import("@inquirer/prompts");
    do {
      rawItems.push(
        await input(
          {
            message: "What did you work on?",
            default: "Development, 40hrs at 120",
            validate: (value) => {
              try {
                buildItem(value);
                return true;
              } catch (error) {
                return (error as Error).message;
              }
            },
            theme: promptTheme(),
          },
          promptContext,
        ),
      );
    } while (
      await confirm(
        { message: "Add another line item?", default: false, theme: promptTheme() },
        promptContext,
      )
    );
  }
  const items = rawItems.map(buildItem);
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  if (!Number.isSafeInteger(total)) throw new Error("This sample total is too large.");
  const invoice: DemoInvoice = {
    number: "INV-0045",
    client: client.name,
    email: client.email,
    status: "draft",
    total,
    balance: total,
    due: "2026-11-04",
    items,
  };
  if (!options().json) {
    u.detail(invoice);
    u.hint("Sample defaults · EUR · due in 30 days · no tax");
    u.line();
  }
  if (!flags.yes) {
    if (!interactive())
      throw new Error("Review the draft, then add --yes to simulate saving without a prompt.");
    const { confirm } = await import("@inquirer/prompts");
    if (
      !(await confirm(
        { message: "Simulate saving this draft?", default: true, theme: promptTheme() },
        promptContext,
      ))
    ) {
      u.hint("Cancelled. Nothing saved.");
      return;
    }
  }
  if (options().json)
    return json({
      action: "create",
      simulated: true,
      saved: false,
      invoice,
      currency: "EUR",
      moneyUnit: "cents",
    });
  u.text("✓ Draft creation simulated.", u.accent);
  u.hint("Nothing saved or sent. The sample resets on the next command.");
  u.line();
}

function buildItem(value: string) {
  const item = parseLineItem(value);
  // Bound the demo to two decimal places. Real invoice totals remain server-authoritative.
  const scaled = (number: number) => {
    const rounded = Math.round(number * 100);
    if (
      !Number.isFinite(number) ||
      Math.abs(number * 100 - rounded) > 1e-6 ||
      !Number.isSafeInteger(rounded) ||
      number > 1_000_000
    )
      throw new Error("Use at most two decimal places and values up to 1,000,000 in this preview.");
    return BigInt(rounded);
  };
  const rate = scaled(item.unitPrice);
  const quantity = scaled(item.quantity);
  return {
    description: clean(item.description),
    quantity: item.quantity,
    rate: Number(rate),
    amount: Number((rate * quantity + 50n) / 100n),
  };
}

program.action(showHome);
program
  .command("tour")
  .description("See the overview, ledger, and delivery review")
  .action(() => {
    if (options().json)
      throw new Error(
        "The tour is visual. Use nota --json or nota invoices --json for sample data.",
      );
    showHome();
    ui().rule();
    listInvoices();
    ui().rule();
    showInvoice("INV-0044");
    ui().rule();
    reviewSend(findInvoice("INV-0044"));
  });
program
  .command("welcome")
  .description("Preview the first-run screen")
  .action(() => {
    if (options().json) return json({ state: "signed_out", next: "nota login" });
    const u = ui();
    u.brand();
    u.text("Your work deserves a good invoice.", u.c.bold);
    u.hint("Create drafts, send invoices, and keep track of what is owed.");
    u.heading("Start here");
    u.text("nota login", u.accent);
    u.hint(
      "The existing CLI signs in with an API key. Browser sign-in is a future design direction.",
    );
    u.line();
  });

const invoiceCommand = program
  .command("invoices")
  .alias("invoice")
  .description("Find, draft, and review invoices");
function filters(command: Command) {
  return command
    .addOption(
      new Option("--status <status>", "Filter by invoice status").choices([
        "draft",
        "sent",
        "overdue",
        "paid",
      ]),
    )
    .option("--client <name>", "Filter by client name");
}
filters(invoiceCommand).action(listInvoices);
filters(invoiceCommand.command("list").alias("ls").description("List invoices")).action(
  (_flags, command: Command) => listInvoices(command.optsWithGlobals()),
);
invoiceCommand
  .command("show <number>")
  .description("Read an invoice, including its balance")
  .action(showInvoice);
invoiceCommand
  .command("create")
  .alias("new")
  .description("Walk through a new draft")
  .option("--client <name>", "Exact sample client name")
  .option(
    "--item <text>",
    "Line item; repeat for multiple items",
    (value, previous: string[]) => [...previous, value],
    [],
  )
  .option("-y, --yes", "Simulate saving the draft without a prompt")
  .action((_flags, command: Command) => createInvoice(command.optsWithGlobals()));
invoiceCommand
  .command("send <number>")
  .description("Review and simulate invoice delivery")
  .option("--dry-run", "Show the recipient and invoice without sending")
  .option("-y, --yes", "Simulate sending without a prompt")
  .action(sendInvoice);

program
  .command("clients")
  .description("See sample clients")
  .action(() => {
    if (options().json) return json({ clients });
    const u = ui();
    u.brand();
    u.heading("Clients");
    for (const client of clients) {
      u.text(client.name, u.c.bold);
      u.text(`${client.email} · ${client.currency}`, u.muted);
      u.line();
    }
    u.hint('Next → nota invoices create --client "Oxide Studio"');
    u.line();
  });

program.addHelpText(
  "after",
  "\nStart here:\n  nota                                What needs attention\n  nota invoices create                Guided draft\n  nota invoices --status overdue      Follow up on unpaid work\n  nota invoices send INV-0044 --dry-run\n  nota invoices --json                Structured sample data\n\nRun via: bun run --cwd apps/cli preview [command]\nAll actions in this preview use sample data and have no side effects.",
);

// Commander errors use the same machine-readable stderr contract as action errors.
process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") process.exit(0);
  throw error;
});
try {
  await program.parseAsync(process.argv);
} catch (error) {
  if (error instanceof CommanderError && error.exitCode === 0) process.exitCode = 0;
  else {
    const cancelled = error instanceof Error && error.name === "ExitPromptError";
    const message = cancelled
      ? "Cancelled. Nothing saved or sent."
      : error instanceof Error
        ? error.message
        : "Something went wrong.";
    process.exitCode = cancelled ? 130 : 1;
    if (options().json || process.argv.includes("--json"))
      console.error(
        JSON.stringify({
          preview: true,
          error: { code: cancelled ? "CANCELLED" : "PREVIEW_ERROR", message },
        }),
      );
    else
      console.error(
        `\n  ${ui().c.yellow(cancelled ? "○" : "!")} ${message.split("\n").map(clean).join("\n    ")}\n`,
      );
  }
}
