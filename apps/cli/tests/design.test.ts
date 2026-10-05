import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import stringWidth from "string-width";
import { clean, fit, wrap } from "../design/ui";

const entry = fileURLToPath(new URL("../design/index.ts", import.meta.url));
function run(args: string[], extraEnv: Record<string, string> = {}) {
  const result = Bun.spawnSync([process.execPath, entry, ...args], {
    env: {
      ...process.env,
      NO_COLOR: "1",
      CI: "1",
      NOTA_URL: "http://127.0.0.1:1",
      NOTA_API_KEY: "unused-preview-key",
      ...extraEnv,
    },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout: 5000,
  });
  return { code: result.exitCode, out: result.stdout.toString(), err: result.stderr.toString() };
}

test("overview uses remaining balances and excludes drafts", () => {
  const result = run(["--json"]);
  expect(result.code).toBe(0);
  expect(result.err).toBe("");
  expect(JSON.parse(result.out)).toMatchObject({
    preview: true,
    data: { outstandingCents: 680000, overdueCents: 480000, draftCount: 1 },
  });
});

test("list aliases support filters and emit only structured data", () => {
  for (const args of [
    ["invoices", "--status", "overdue"],
    ["invoice", "ls", "--status", "overdue"],
    ["invoices", "--status", "overdue", "list"],
  ]) {
    const result = run([...args, "--json"]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.out).data.invoices.map((i: { number: string }) => i.number)).toEqual([
      "INV-0042",
    ]);
    expect(result.err).toBe("");
  }
});

test("flag-driven creation retains parent client option and sums line items", () => {
  const result = run([
    "invoices",
    "create",
    "--client",
    "Oxide Studio",
    "--item",
    "Development, 40hrs at 120",
    "--item",
    "Discovery | 1 | 800",
    "--yes",
    "--json",
  ]);
  expect(result.code).toBe(0);
  expect(JSON.parse(result.out).data).toMatchObject({
    simulated: true,
    saved: false,
    invoice: { total: 560000, status: "draft" },
  });
});

test("send dry-run never claims delivery and unconfirmed automation fails", () => {
  const preview = run(["invoices", "send", "INV-0044", "--dry-run", "--json"]);
  expect(preview.code).toBe(0);
  expect(JSON.parse(preview.out).data).toMatchObject({
    dryRun: true,
    recipient: "hello@good.example",
  });
  const blocked = run(["invoices", "send", "INV-0044", "--json"]);
  expect(blocked.code).toBe(1);
  expect(blocked.out).toBe("");
  expect(JSON.parse(blocked.err).error.message).toContain("--dry-run");
  const simulated = run(["invoices", "send", "INV-0044", "--yes", "--json"]);
  expect(JSON.parse(simulated.out).data).toMatchObject({ simulated: true, sent: false });
});

test("missing input and unknown commands fail promptly with usable errors", () => {
  for (const args of [
    ["invoices", "create"],
    ["invoices", "show", "INV-missing"],
    ["invoics"],
    ["invoices", "--status", "nope"],
  ]) {
    const result = run([...args, "--json"]);
    expect(result.code).toBe(1);
    expect(result.out).toBe("");
    expect(JSON.parse(result.err).error.message.length).toBeGreaterThan(10);
  }
});

test("all tour content fits 32, 40, 80, and 120-column terminals", () => {
  for (const width of [32, 40, 80, 120]) {
    const result = run(["tour", "--width", String(width)]);
    expect(result.code).toBe(0);
    for (const line of result.out.split("\n")) expect(stringWidth(line)).toBeLessThanOrEqual(width);
    expect(result.out).toContain("€4,800.00");
    expect(result.out).not.toContain("\x1b");
  }
});

test("no-color overrides forced color", () => {
  const result = run(["invoices", "--no-color"], { FORCE_COLOR: "3" });
  expect(result.out).not.toContain("\x1b");
});

test("empty filters give a recovery path", () => {
  const result = run(["invoices", "--client", "Nobody"]);
  expect(result.code).toBe(0);
  expect(result.out).toContain("No invoices match");
  expect(result.out).toContain("nota invoices create");
});

test("terminal layout handles emoji, CJK, combining marks, and control characters", () => {
  expect(stringWidth(fit("東京 design 👩‍💻", 10))).toBe(10);
  expect(wrap("東京 e\u0301 👩‍💻 studio", 6).every((line) => stringWidth(line) <= 6)).toBe(true);
  expect(clean("evil\x1b[2J\nname\x07")).toBe("evil name ");
});
