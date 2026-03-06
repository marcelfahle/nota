import type { Command } from "commander";

import { getResolvedConfig, maskApiKey, updateConfig } from "../config.js";
import { printConfig } from "../output/config.js";

async function printResolvedConfig() {
  const config = await getResolvedConfig();
  printConfig({
    apiKey: maskApiKey(config.apiKey),
    path: config.path,
    url: config.url,
  });
}

export function registerConfigCommands(program: Command) {
  const configCommand = program.command("config").description("Manage CLI configuration");

  configCommand
    .command("set-url")
    .argument("<url>")
    .description("Persist the Nota base URL")
    .action(async (url: string) => {
      await updateConfig({ url: url.trim() });
      await printResolvedConfig();
    });

  configCommand
    .command("set-key")
    .argument("<key>")
    .description("Persist the Nota API key")
    .action(async (apiKey: string) => {
      await updateConfig({ apiKey: apiKey.trim() });
      await printResolvedConfig();
    });

  configCommand
    .command("show")
    .description("Show the resolved CLI configuration")
    .action(printResolvedConfig);
}
