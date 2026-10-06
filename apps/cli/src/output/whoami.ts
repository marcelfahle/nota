import type { MeResponse } from "@nota-app/sdk";
import { createUI } from "./shared.js";
export function printWhoAmI(me: MeResponse) {
  const u = createUI();
  u.brand(`${me.org.businessName || me.org.name} · ${me.role}`);
  u.text(`${me.user.name} · ${me.user.email}`);
}
