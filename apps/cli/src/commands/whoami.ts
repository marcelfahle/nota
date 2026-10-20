import type { Command } from "commander";

import { emit } from "../output/shared.js";
import { requireClient } from "../helpers.js";
import { printWhoAmI } from "../output/whoami.js";

export function registerWhoAmICommand(program: Command) {
  program
    .command("whoami")
    .description("Show the authenticated Nota user")
    .action(async () => {
      const client = await requireClient();
      const me = await client.getMe();
      emit(me, () => printWhoAmI(me));
    });
}
