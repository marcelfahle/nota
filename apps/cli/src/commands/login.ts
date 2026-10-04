import { input, password } from "@inquirer/prompts";
import { createNotaClient } from "@nota-app/sdk";
import type { Command } from "commander";

import { updateConfig } from "../config.js";
import { printWhoAmI } from "../output/whoami.js";

const DEFAULT_URL = "https://app.withnota.com";

export function registerLoginCommand(program: Command) {
  program
    .command("login")
    .description("Sign in with a Nota API key")
    .action(async () => {
      const url = (
        await input({
          default: DEFAULT_URL,
          message: "Nota URL",
        })
      ).trim();
      const apiKey = (
        await password({
          mask: "*",
          message: "API key",
        })
      ).trim();

      if (!apiKey) {
        throw new Error("Nota API key is required");
      }

      const client = createNotaClient(url, apiKey, (request, init) => {
        const headers = new Headers(init?.headers);
        headers.set("user-agent", "nota-cli");
        return fetch(request, { ...init, headers });
      });
      const me = await client.getMe();
      await updateConfig({ apiKey, url });
      printWhoAmI(me);
    });
}
