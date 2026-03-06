#!/usr/bin/env node

import chalk from "chalk";
import { Command } from "commander";

import { registerClientCommands } from "./commands/clients.js";
import { registerConfigCommands } from "./commands/config.js";
import { registerInvoiceCommands } from "./commands/invoices.js";
import { registerWhoAmICommand } from "./commands/whoami.js";
import { getCliErrorMessage } from "./helpers.js";

const program = new Command();

program.name("nota").description("CLI for Nota").showHelpAfterError().version("0.1.0");

registerConfigCommands(program);
registerWhoAmICommand(program);
registerInvoiceCommands(program);
registerClientCommands(program);

async function main() {
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    console.error(chalk.red(getCliErrorMessage(error)));
    process.exitCode = 1;
  }
}

if (process.argv.length <= 2) {
  program.outputHelp();
} else {
  await main();
}
