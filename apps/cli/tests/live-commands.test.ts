import { afterAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import stringWidth from "string-width";
import { clean, configureOutput, createUI, formatCurrency, wrap } from "../src/output/shared";
import { printInvoiceList } from "../src/output/invoices";
const entry = fileURLToPath(new URL("../src/index.ts", import.meta.url));
const dir = await mkdtemp(join(tmpdir(), "nota-cli-fixtures-"));
const clientId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const invoiceId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const person = {
  id: clientId,
  name: "Oxide Studio",
  email: "billing@oxide.test",
  defaultCurrency: "EUR",
};
const invoice = {
  id: invoiceId,
  number: "INV-0042",
  status: "draft",
  currency: "EUR",
  subtotal: "1200.00",
  taxAmount: "252.00",
  taxRate: "21",
  total: "1452.00",
  balance: "1452.00",
  paidAmount: "0.00",
  settlementStatus: "unpaid",
  issuedAt: "2026-10-05",
  dueAt: "2026-11-04",
  updatedAt: "2026-10-05T00:00:00Z",
  client: person,
  lineItems: [{ description: "Design", quantity: "1", unitPrice: "1200.00", amount: "1200.00" }],
  activityLog: [],
  notes: "",
  internalNotes: "",
  payments: [],
};
let posts: string[] = [];
let pages: number[] = [];
let changed = false;
let gets = 0;
const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (request.headers.get("authorization") !== "Bearer fixture-token")
      return Response.json({ error: "unauthorized" }, { status: 401 });
    if (request.method === "POST") {
      posts.push(path);
      if (path.endsWith("/clients")) return Response.json({ data: person });
      return Response.json({ data: invoice, warning: "Fixture warning" });
    }
    if (path.endsWith("/me"))
      return Response.json({
        data: {
          user: { id: "fixture", name: "Test User", email: "user@nota.test" },
          org: { id: "fixture-org", name: "Fixture workspace" },
          role: "owner",
        },
      });
    if (path === "/api/v1/clients")
      return Response.json({ data: [person], pagination: { page: 1, perPage: 20, total: 1 } });
    if (path === "/api/v1/invoices") {
      const page = Number(url.searchParams.get("page") || 1);
      pages.push(page);
      const perPage = Number(url.searchParams.get("per_page") || 20);
      return Response.json({
        data: [{ ...invoice, status: url.searchParams.get("status") || "draft" }],
        pagination: { page, perPage, total: perPage === 1 ? 2 : 1 },
      });
    }
    if (path.endsWith(invoiceId)) {
      gets++;
      return Response.json({
        data: { ...invoice, total: changed && gets > 1 ? "2000.00" : invoice.total },
      });
    }
    if (path.endsWith(clientId)) return Response.json({ data: person });
    return Response.json({ error: "not found" }, { status: 404 });
  },
});
afterAll(async () => {
  server.stop(true);
  await rm(dir, { recursive: true, force: true });
});
async function run(args: string[], extra: Record<string, string | undefined> = {}) {
  const proc = Bun.spawn([process.execPath, entry, ...args], {
    env: {
      ...process.env,
      CI: "1",
      NO_COLOR: "1",
      NOTA_API_KEY: "fixture-token",
      NOTA_URL: server.url.origin,
      NOTA_CONFIG_DIR: dir,
      ...extra,
    },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { out, err, code };
}
test("live invoice filters, aliases, pagination and decimal-string JSON stay intact", async () => {
  for (const args of [
    ["invoices", "--status", "overdue"],
    ["invoice", "ls", "--status", "overdue"],
    ["invoices", "--status", "overdue", "list"],
  ]) {
    const r = await run([...args, "--json"]);
    expect(r.code).toBe(0);
    expect(r.err).toBe("");
    expect(JSON.parse(r.out)).toMatchObject({
      data: [{ status: "overdue", total: "1452.00" }],
      pagination: { total: 1 },
    });
  }
  pages = [];
  const all = await run(["invoices", "--all", "--per-page", "1", "--json"]);
  expect(all.code).toBe(0);
  expect(pages).toEqual([1, 2]);
  expect(JSON.parse(all.out).data).toHaveLength(2);
  const invalid = await run(["invoices", "--page", "0", "--json"]);
  expect(invalid.code).toBe(1);
  expect(invalid.out).toBe("");
  expect(JSON.parse(invalid.err).error.message).toContain("positive integer");
});
test("real send command requires approval, dry-run cannot mutate, stale review cannot send", async () => {
  posts = [];
  gets = 0;
  const dry = await run(["invoices", "send", invoiceId, "--dry-run", "--json"]);
  expect(dry.code).toBe(0);
  expect(JSON.parse(dry.out)).toMatchObject({
    dryRun: true,
    workspace: { name: "Fixture workspace" },
    invoice: { total: "1452.00" },
  });
  expect(posts).toEqual([]);
  const denied = await run(["invoices", "send", invoiceId, "--json"]);
  expect(denied.code).toBe(1);
  expect(denied.out).toBe("");
  expect(JSON.parse(denied.err).error.message).toContain("--yes");
  expect(posts).toEqual([]);
  changed = true;
  gets = 0;
  const stale = await run(["invoices", "send", invoiceId, "--yes", "--json"]);
  expect(stale.code).toBe(1);
  expect(JSON.parse(stale.err).error.message).toContain("changed during review");
  expect(posts).toEqual([]);
  changed = false;
  gets = 0;
  const approved = await run(["invoices", "send", invoiceId, "--yes", "--json"]);
  expect(approved.code).toBe(0);
  expect(posts).toEqual([`/api/v1/invoices/${invoiceId}/send`]);
  expect(JSON.parse(approved.out).warning).toBe("Fixture warning");
  expect(approved.err).toBe("");
});
test("draft creation accepts natural items, and missing interactive input fails promptly", async () => {
  posts = [];
  const missing = await run(["invoices", "create", "--no-input", "--json"]);
  expect(missing.code).toBe(1);
  expect(JSON.parse(missing.err).error.message).toContain("--client");
  expect(posts).toEqual([]);
  const dry = await run([
    "invoices",
    "create",
    "--client",
    clientId,
    "--item",
    "Design, 10hrs at 120",
    "--due-at",
    "2026-02-31",
    "--dry-run",
    "--json",
  ]);
  expect(dry.code).toBe(1);
  expect(posts).toEqual([]);
  const created = await run([
    "invoices",
    "create",
    "--client",
    clientId,
    "--item",
    "Design, 10hrs at 120",
    "--json",
  ]);
  expect(created.code).toBe(0);
  expect(posts).toEqual(["/api/v1/invoices"]);
  expect(JSON.parse(created.out).invoice.status).toBe("draft");
});
test("home is useful offline, JSON identity and unknown commands are scriptable", async () => {
  const home = await run([], {
    NOTA_API_KEY: undefined,
    NOTA_URL: "http://127.0.0.1:1",
    NOTA_CONFIG_DIR: dir + "/empty",
  });
  expect(home.code).toBe(0);
  expect(home.out).toContain("nota login");
  expect(home.out.split("\n").length).toBeLessThan(8);
  const me = await run(["whoami", "--json"]);
  expect(me.code).toBe(0);
  expect(JSON.parse(me.out).user.email).toBe("user@nota.test");
  const bad = await run(["invoics", "--json"]);
  expect(bad.code).toBe(1);
  expect(bad.out).toBe("");
  expect(JSON.parse(bad.err).error.message.toLowerCase()).toContain("unknown command");
  const help = await run(["--help"], { NOTA_URL: "http://127.0.0.1:1" });
  expect(help.code).toBe(0);
});
test("terminal output is dense, Unicode-aware and strips terminal controls", () => {
  configureOutput({ color: false });
  expect(formatCurrency("9007199254740993.01", "EUR")).toBe("€9,007,199,254,740,993.01");
  expect(clean("\x1b[31mHi\x1b[0m\nthere")).toBe("Hi there");
  for (const width of [20, 32, 40])
    for (const line of wrap("会社 👩🏽‍💻 é ".repeat(8), width))
      expect(stringWidth(line)).toBeLessThanOrEqual(width);
  const lines: string[] = [];
  const u = createUI(40, (line) => lines.push(line));
  u.heading("Invoice");
  u.field("Recipient", "user@nota.test");
  u.hint("No email sent.");
  expect(lines).toHaveLength(4);
  const original = console.log;
  const out: string[] = [];
  console.log = (line) => out.push(String(line));
  try {
    printInvoiceList(Array.from({ length: 10 }, () => invoice) as never);
  } finally {
    console.log = original;
  }
  expect(out.length).toBeLessThanOrEqual(14);
});

test("clients, headless API-key login and masked config have clean JSON contracts", async () => {
  const listing = await run(["client", "ls", "--search", "oxide", "--json"]);
  expect(listing.code).toBe(0);
  expect(JSON.parse(listing.out).data[0].id).toBe(clientId);
  const missing = await run([
    "clients",
    "create",
    "--name",
    " ",
    "--email",
    "x@nota.test",
    "--json",
  ]);
  expect(missing.code).toBe(1);
  expect(missing.out).toBe("");
  const login = await run(["login", "--api-key", "--no-input", "--json"]);
  expect(login.code).toBe(0);
  expect(login.err).toBe("");
  expect(JSON.parse(login.out).role).toBe("owner");
  const config = await run(["config", "show", "--json"]);
  expect(config.code).toBe(0);
  expect(config.out).not.toContain("fixture-token");
  expect(JSON.parse(config.out).auth).toBe("API key");
});
