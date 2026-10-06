import { createNotaClient } from "@nota-app/sdk";
import type { Command } from "commander";

import { promptContext, promptTheme, requireInput } from "../interaction.js";
import { emit, outputOptions, printSuccess, printWarning } from "../output/shared.js";
import { clearLogin, readConfig, updateConfig } from "../config.js";
import { browserLogin, disconnectSession, normalizeIssuer, openBrowser } from "../oauth.js";
import { printWhoAmI } from "../output/whoami.js";

export function registerLoginCommand(program: Command) {
  program
    .command("login")
    .description("Sign in securely through your browser")
    .option("--url <url>", "Nota server URL")
    .option("--no-browser", "Print the sign-in URL without opening a browser")
    .option("--api-key", "Sign in with an API key instead")
    .action(async (options: { url?: string; browser: boolean; apiKey?: boolean }) => {
      if (!options.apiKey && (outputOptions().json || outputOptions().input === false))
        throw new Error(
          "Browser login needs a browser. Run nota login without --json/--no-input, or use NOTA_API_KEY with login --api-key.",
        );
      if (options.apiKey && !process.env.NOTA_API_KEY)
        requireInput("NOTA_API_KEY in the environment, or use interactive login --api-key");
      const saved = await readConfig();
      const url = normalizeIssuer(
        options.url || process.env.NOTA_URL || saved.url || "https://app.withnota.com",
      );
      const controller = new AbortController();
      const cancel = () => controller.abort();
      process.once("SIGINT", cancel);
      try {
        const oauth = options.apiKey
          ? undefined
          : await browserLogin(url, {
              signal: controller.signal,
              onAuthorize: async (authorizationUrl) => {
                console.error("  Sign in to Nota");
                console.error(`  ${authorizationUrl}`);
                if (options.browser) await openBrowser(authorizationUrl);
                console.error("  Waiting for browser approval… Ctrl+C to cancel.");
              },
            });
        let apiKey: string | undefined;
        if (!oauth) {
          apiKey = process.env.NOTA_API_KEY?.trim();
          if (!apiKey) {
            const { password } = await import("@inquirer/prompts");
            apiKey = (
              await password({ mask: "*", message: "API key", theme: promptTheme() }, promptContext)
            ).trim();
          }
        }
        const token = oauth?.accessToken || apiKey;
        if (!token) throw new Error("An API key is required.");
        const client = createNotaClient(url, token, (request, init) => {
          const headers = new Headers(init?.headers);
          headers.set("user-agent", "nota-cli");
          return fetch(request, {
            ...init,
            headers,
            redirect: "error",
            signal: AbortSignal.timeout(30_000),
          });
        });
        const me = await client.getMe();
        await updateConfig({ apiKey, oauth, url });
        emit(me, () => printWhoAmI(me));
        if (process.env.NOTA_API_KEY && !outputOptions().json)
          printWarning("NOTA_API_KEY overrides saved login credentials.");
      } finally {
        process.removeListener("SIGINT", cancel);
      }
    });

  program
    .command("logout")
    .description("Sign out of this computer and revoke its browser session")
    .action(async () => {
      const { oauth } = await clearLogin();
      let warning: string | undefined;
      if (oauth) {
        try {
          await disconnectSession(oauth);
        } catch {
          warning =
            "Local login removed. Server revocation failed; disconnect Nota CLI in Settings → API → Connected apps.";
          process.exitCode = 1;
        }
      }
      const environmentAuth = Boolean(process.env.NOTA_API_KEY);
      emit(
        { signedOut: true, serverRevoked: oauth ? !warning : null, environmentAuth, warning },
        () => {
          printSuccess("Signed out of Nota on this computer.");
          printWarning(warning);
          if (environmentAuth)
            printWarning("NOTA_API_KEY is still set. Unset it to stop environment authentication.");
        },
      );
    });
}
