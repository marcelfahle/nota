import chalk from "chalk";

import type { MeResponse } from "@nota-app/sdk";

export function printWhoAmI(me: MeResponse) {
  console.log(chalk.bold(me.user.name));
  console.log(me.user.email);
  console.log(`${me.org.businessName ?? me.org.name} (${me.role})`);
}
