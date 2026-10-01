import { App } from "@modelcontextprotocol/ext-apps";
import type { InvoiceDetail, InvoiceSummary, Pagination } from "@nota-app/sdk";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

type ViewData = {
  invoice?: InvoiceDetail;
  invoices?: InvoiceSummary[];
  pagination?: Pagination;
  org?: { name: string };
  counts?: Record<string, number>;
  warning?: string;
};
const app = new App({ name: "Nota invoice workspace", version: "0.2.0" });
const content = document.querySelector<HTMLElement>("#content")!;
const notice = document.querySelector<HTMLElement>("#notice")!;
let data: ViewData = {};
let search = "";
let status = "";
let page = 1;
let busy = false;
let revision = 0;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function money(value: string | null | undefined, currency: string | null) {
  const amount = Number(value ?? 0);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency ?? "EUR",
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency ?? "EUR"}`;
  }
}
function date(value: string) {
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(parsed);
}
function button(label: string, action: () => Promise<void> | void) {
  const node = el("button", label);
  node.type = "button";
  node.disabled = busy;
  node.addEventListener("click", () => {
    void run(action);
  });
  return node;
}
async function run(action: () => Promise<void> | void) {
  if (busy) return;
  busy = true;
  notice.textContent = "";
  content.setAttribute("aria-busy", "true");
  content.querySelectorAll("button").forEach((node) => {
    node.disabled = true;
  });
  try {
    await action();
  } catch (error) {
    notice.textContent =
      error instanceof Error ? error.message : "Something went wrong. Try again.";
  } finally {
    busy = false;
    content.setAttribute("aria-busy", "false");
    content.querySelectorAll("button").forEach((node) => {
      node.disabled = false;
    });
  }
}
async function call(name: string, args: Record<string, unknown>) {
  const result = await app.callServerTool({ name, arguments: args });
  if (result.isError)
    throw new Error(
      result.content
        .filter((item) => item.type === "text")
        .map((item) => item.text)
        .join("\n"),
    );
  return result;
}
async function loadList() {
  const current = revision;
  const result = await call("list_invoices", {
    page,
    perPage: 8,
    ...(search ? { search } : {}),
    ...(status ? { status } : {}),
  });
  if (current === revision) show(result.structuredContent as ViewData);
}
async function loadInvoice(invoiceId: string) {
  const current = revision;
  const result = await call("get_invoice", { invoiceId });
  if (current === revision) show(result.structuredContent as ViewData);
}
async function download(invoiceId: string, format: "pdf" | "xml") {
  const result = await call(format === "pdf" ? "download_pdf" : "download_xml", { invoiceId });
  const file = result.structuredContent as {
    pdfBase64?: string;
    xmlBase64?: string;
    mimeType: string;
    filename: string;
  };
  const blob = file.pdfBase64 ?? file.xmlBase64;
  if (!blob) throw new Error("The server did not return a file.");
  const downloaded = await app.downloadFile({
    contents: [
      {
        type: "resource",
        resource: {
          uri: `file:///${encodeURIComponent(file.filename)}`,
          mimeType: file.mimeType,
          blob,
        },
      },
    ],
  });
  notice.textContent = downloaded.isError
    ? "Download was declined by the host."
    : `${file.filename} sent to your download handler.`;
}
function show(next: ViewData) {
  revision++;
  data = next;
  if (data.org) document.querySelector("#organization")!.textContent = data.org.name;
  notice.textContent = next.warning ?? "";
  content.replaceChildren();
  content.setAttribute("aria-busy", "false");
  if (data.invoice) detail(data.invoice);
  else list();
}
function list() {
  const heading = el("div", undefined, "heading");
  heading.append(el("h1", "Your invoices"), button("Refresh", loadList));
  content.append(heading);
  if (data.counts) {
    const metrics = el("div", undefined, "metrics");
    for (const [label, key] of [
      ["All invoices", "totalInvoices"],
      ["Drafts", "draft"],
      ["Awaiting payment", "sent"],
      ["Overdue", "overdue"],
    ]) {
      const metric = el("div");
      metric.append(el("strong", String(data.counts[key] ?? 0)), el("span", label));
      metrics.append(metric);
    }
    content.append(metrics);
  }
  const toolbar = el("form", undefined, "toolbar");
  const input = el("input");
  input.placeholder = "Find invoice or client";
  input.setAttribute("aria-label", "Search invoices");
  input.value = search;
  const select = el("select");
  select.setAttribute("aria-label", "Invoice status");
  for (const value of ["", "draft", "sent", "paid", "overdue", "cancelled"]) {
    const option = el("option", value || "All statuses");
    option.value = value;
    select.append(option);
  }
  select.value = status;
  const submit = el("button", "Search");
  submit.type = "submit";
  submit.disabled = busy;
  toolbar.append(input, select, submit);
  toolbar.addEventListener("submit", (event) => {
    event.preventDefault();
    search = input.value.trim();
    status = select.value;
    page = 1;
    void run(loadList);
  });
  content.append(toolbar);
  const rows = el("div", undefined, "rows");
  for (const invoice of data.invoices ?? []) {
    const row = button("", () => loadInvoice(invoice.id));
    row.className = "row";
    const left = el("div");
    left.append(
      el("strong", invoice.number),
      el("span", invoice.client?.name ?? "Unknown client", "subtitle"),
    );
    const right = el("div", undefined, "right");
    right.append(
      el("strong", money(invoice.total, invoice.currency), "money"),
      el("span", invoice.status, `badge ${invoice.status}`),
    );
    row.append(left, right);
    rows.append(row);
  }
  if (!data.invoices?.length)
    rows.append(el("p", "No invoices match. Try another search or status.", "empty"));
  content.append(rows);
  const footer = el("div", undefined, "footer");
  if (data.pagination) {
    page = data.pagination.page;
    footer.append(el("span", `Page ${page} · ${data.pagination.total} invoices`));
    const controls = el("div", undefined, "actions");
    if (page > 1)
      controls.append(
        button("Previous", async () => {
          page--;
          await loadList();
        }),
      );
    if (page * data.pagination.perPage < data.pagination.total)
      controls.append(
        button("Next", async () => {
          page++;
          await loadList();
        }),
      );
    footer.append(controls);
  } else footer.append(el("span", "Recent invoices · ask for a date range to explore further"));
  content.append(footer);
}
function detail(invoice: InvoiceDetail) {
  content.append(el("div", undefined, "toolbar"));
  content.lastElementChild!.append(button("← All invoices", loadList));
  const heading = el("div", undefined, "heading");
  const title = el("div");
  title.append(
    el("h1", invoice.number),
    el(
      "div",
      `${invoice.client?.name ?? "Unknown client"} · ${invoice.client?.email ?? ""}`,
      "subtitle",
    ),
  );
  heading.append(title, el("span", invoice.status, `badge ${invoice.status}`));
  content.append(heading, el("div", money(invoice.total, invoice.currency), "amount"));
  const actions = el("div", undefined, "actions");
  actions.append(
    button("Download PDF", () => download(invoice.id, "pdf")),
    button("XRechnung XML", () => download(invoice.id, "xml")),
    button("Refresh", () => loadInvoice(invoice.id)),
  );
  // External messages stay in the host's confirmation flow.
  if (invoice.status === "draft")
    actions.append(button("Review sending…", () => confirmSend(invoice)));
  content.append(actions);
  const dates = el("dl", undefined, "dates");
  for (const [label, value] of [
    ["Issue date", date(invoice.issuedAt)],
    ["Due date", date(invoice.dueAt)],
    ["Currency", invoice.currency ?? "EUR"],
  ]) {
    const entry = el("div");
    entry.append(el("dt", label), el("dd", value));
    dates.append(entry);
  }
  content.append(dates);
  const wrap = el("div", undefined, "table-wrap");
  const table = el("table");
  const head = el("thead");
  const headRow = el("tr");
  for (const label of ["Description", "Qty", "Rate", "Amount"]) headRow.append(el("th", label));
  head.append(headRow);
  table.append(head);
  const body = el("tbody");
  for (const item of invoice.lineItems) {
    const row = el("tr");
    for (const value of [
      item.description,
      item.quantity,
      money(item.unitPrice, invoice.currency),
      money(item.amount, invoice.currency),
    ])
      row.append(el("td", value));
    body.append(row);
  }
  table.append(body);
  wrap.append(table);
  content.append(wrap);
  const totals = el("div", undefined, "totals");
  const totalRows: Array<[string, string | null]> = [
    ["Subtotal", invoice.subtotal],
    [`Tax (${invoice.taxRate ?? "0"}%)`, invoice.taxAmount],
    ["Total", invoice.total],
  ];
  for (const [label, value] of totalRows) {
    const row = el("div", undefined, label === "Total" ? "total" : undefined);
    row.append(el("span", label), el("span", money(value, invoice.currency), "money"));
    totals.append(row);
  }
  content.append(totals);
  if (invoice.reverseCharge === true || invoice.reverseCharge === "true")
    content.append(el("p", "Reverse charge applies.", "notes"));
  if (invoice.notes) content.append(el("h2", "Notes"), el("p", invoice.notes, "notes"));
  if (invoice.activityLog?.length) {
    const activity = el("ul", undefined, "activity");
    for (const entry of invoice.activityLog.slice(0, 5))
      activity.append(el("li", `${entry.action.replaceAll("_", " ")} · ${date(entry.createdAt)}`));
    content.append(el("h2", "Activity"), activity);
  }
}
function confirmSend(invoice: InvoiceDetail) {
  const existing = content.querySelector(".confirm");
  if (existing) {
    existing.remove();
    return;
  }
  const confirmation = el("div", undefined, "confirm");
  confirmation.append(
    el(
      "p",
      `Send ${invoice.number} for ${money(invoice.total, invoice.currency)} to ${invoice.client?.email ?? "the client"}?`,
    ),
  );
  confirmation.append(
    button("Ask to send", async () => {
      const result = await app.sendMessage({
        role: "user",
        content: [
          {
            type: "text",
            text: `Please send invoice ${invoice.number} (ID ${invoice.id}) to its client. I have reviewed its details.`,
          },
        ],
      });
      if (result.isError) throw new Error("The host could not start the send request.");
      confirmation.replaceChildren(
        el("p", "Send requested. Follow the confirmation in your conversation."),
      );
    }),
    button("Keep as draft", () => confirmation.remove()),
  );
  content.insertBefore(confirmation, content.querySelector(".dates"));
}
app.ontoolresult = (result) => {
  if (result.isError) {
    const toolResult = result as CallToolResult;
    notice.textContent = toolResult.content
      .filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("\n");
    return;
  }
  show((result.structuredContent ?? {}) as ViewData);
};
app.onhostcontextchanged = (context) => {
  if (context.theme) document.documentElement.dataset.theme = context.theme;
};
void app
  .connect()
  .then(() => {
    const theme = app.getHostContext()?.theme;
    if (theme) document.documentElement.dataset.theme = theme;
  })
  .catch(() => {
    notice.textContent =
      "Connect this workspace through a compatible MCP Apps host to load your invoices.";
    content.setAttribute("aria-busy", "false");
  });
