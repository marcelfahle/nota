#!/usr/bin/env node
import { Command, CommanderError } from "commander";
import { registerClientCommands } from "./commands/clients.js";
import { registerConfigCommands } from "./commands/config.js";
import { registerInvoiceCommands } from "./commands/invoices.js";
import { registerLoginCommand } from "./commands/login.js";
import { registerWhoAmICommand } from "./commands/whoami.js";
import { showHome } from "./commands/home.js";
import { getCliErrorMessage } from "./helpers.js";
import { clean, configureOutput, createUI } from "./output/shared.js";
const program = new Command();
program
  .name("nota")
  .description("Invoices, without the busywork.")
  .version("0.2.0")
  .option("--json", "Structured output; never prompt")
  .option("--no-color", "Disable terminal colors")
  .option("--no-input", "Never prompt; require explicit flags")
  .option("-y, --yes", "Approve the requested action")
  .showSuggestionAfterError()
  .exitOverride()
  .configureOutput({ writeErr: () => {} });
program.hook("preAction", (_command, action) => configureOutput(action.optsWithGlobals()));
registerConfigCommands(program);
registerLoginCommand(program);
registerWhoAmICommand(program);
registerInvoiceCommands(program);
registerClientCommands(program);
program.action(showHome);
try {
  await program.parseAsync(process.argv);
} catch (error) {
  if (
    error instanceof CommanderError &&
    ["commander.helpDisplayed", "commander.version"].includes(error.code)
  )
    process.exitCode = 0;
  else {
    const cancelled =
      (error instanceof Error && ["ExitPromptError", "AbortError"].includes(error.name)) ||
      (error instanceof Error && error.message === "Sign-in cancelled.");
    const message = cancelled
      ? "Cancelled."
      : error instanceof CommanderError && error.code === "commander.excessArguments"
        ? "Unknown command or unexpected argument. Run nota --help."
        : getCliErrorMessage(error);
    if (process.argv.includes("--json"))
      console.error(
        JSON.stringify({ error: { message, code: cancelled ? "cancelled" : "command_failed" } }),
      );
    else {
      const u = createUI();
      console.error(`  ${u.c.red(clean(message))}`);
    }
    process.exitCode = cancelled ? 130 : 1;
  }
}
