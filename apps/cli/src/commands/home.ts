import { getResolvedConfig } from "../config.js";
import { requireClient } from "../helpers.js";
import { createUI, emit } from "../output/shared.js";
import { printInvoiceList } from "../output/invoices.js";
export async function showHome() {
  const config = await getResolvedConfig();
  const u = createUI();
  if (config.auth === "Not signed in")
    return emit({ authenticated: false, next: "nota login" }, () => {
      u.brand();
      u.line();
      u.text("Get started → nota login");
      u.text("Explore     → nota --help");
    });
  const client = await requireClient();
  const [me, recent] = await Promise.all([client.getMe(), client.listInvoices({ perPage: 5 })]);
  emit({ workspace: me.org, recentInvoices: recent }, () => {
    u.brand(`${me.org.businessName || me.org.name} · ${me.role}`);
    printInvoiceList(
      recent.data,
      `Recent invoices · ${recent.data.length} of ${recent.pagination.total}`,
    );
    u.line();
    u.text("Draft → nota invoices create    All → nota invoices    Help → nota --help");
  });
}
