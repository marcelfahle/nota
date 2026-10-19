/* eslint-disable no-console */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { generateXRechnung } from "../src/lib/xrechnung";
import { XRECHNUNG_FIXTURES } from "../src/lib/xrechnung.fixtures";

/**
 * Proves every XRechnung Nota can produce against the official KoSIT
 * validator. Downloads the pinned validator and XRechnung configuration once
 * into `.cache/kosit`, generates one XML per fixture, validates them in a
 * single run and fails on any reject or unmatched scenario.
 *
 * Needs Java 17 on PATH (or JAVA_HOME) and `unzip`.
 */

const VALIDATOR_VERSION = "1.6.3";
const XRECHNUNG_VERSION = "3.0.2";
const CONFIGURATION_DATE = "2026-08-31";

const VALIDATOR = {
  file: `validator-${VALIDATOR_VERSION}-standalone.jar`,
  sha256: "799e64befca97d4080e03608c80b85dd5a5ecc5f4ae4f35d1116ec2855b9a7c9",
  url: `https://github.com/itplr-kosit/validator/releases/download/v${VALIDATOR_VERSION}/validator-${VALIDATOR_VERSION}-standalone.jar`,
};
const CONFIGURATION = {
  file: `xrechnung-${XRECHNUNG_VERSION}-validator-configuration-${CONFIGURATION_DATE}.zip`,
  sha256: "2530cd107c414511c5d0462ec10f886910395abfca820db82e83d70bf01221a8",
  url: `https://github.com/itplr-kosit/validator-configuration-xrechnung/releases/download/v${CONFIGURATION_DATE}/xrechnung-${XRECHNUNG_VERSION}-validator-configuration-${CONFIGURATION_DATE}.zip`,
};

// Warnings never fail the run, but the fixtures are expected to produce none.
// BR-DE-19 (SEPA transfer needs a correct IBAN) is the one that fires on
// made-up test IBANs; the fixtures use a valid one so it stays silent.

const appDir = dirname(dirname(fileURLToPath(import.meta.url)));
const cacheDir = join(appDir, ".cache", "kosit");
const configDir = join(cacheDir, `configuration-${CONFIGURATION_DATE}`);
const outDir = join(cacheDir, "out");

async function sha256(path: string) {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

async function download(asset: { file: string; sha256: string; url: string }) {
  const path = join(cacheDir, asset.file);
  if (existsSync(path)) {
    if ((await sha256(path)) === asset.sha256) {
      return path;
    }
    console.log(`Cached ${asset.file} does not match its checksum, downloading again.`);
    await unlink(path);
  }
  console.log(`Downloading ${asset.url}`);
  const response = await fetch(asset.url);
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText} for ${asset.url}`);
  }
  await writeFile(path, new Uint8Array(await response.arrayBuffer()));
  const actual = await sha256(path);
  if (actual !== asset.sha256) {
    await unlink(path);
    throw new Error(`Checksum mismatch for ${asset.file}: expected ${asset.sha256}, got ${actual}`);
  }
  return path;
}

async function ensureConfiguration() {
  const zip = await download(CONFIGURATION);
  if (existsSync(join(configDir, "scenarios.xml"))) {
    return;
  }
  const result = spawnSync("unzip", ["-q", "-o", zip, "-d", configDir], { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`Could not unzip ${zip} (is unzip installed?)`);
  }
}

function javaBinary() {
  return process.env.JAVA_HOME ? join(process.env.JAVA_HOME, "bin", "java") : "java";
}

type Report = {
  accepted: boolean;
  messages: Array<{ code: string; level: string; text: string }>;
  scenario: string | null;
};

function unescapeXml(value: string) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function parseReport(xml: string): Report {
  const scenario = xml.includes("<rep:noScenarioMatched")
    ? null
    : (/<rep:scenarioMatched>[\s\S]*?<s:name>([^<]*)<\/s:name>/.exec(xml)?.[1] ?? null);
  const messages = [...xml.matchAll(/<rep:message\b([^>]*)>([\s\S]*?)<\/rep:message>/g)].map(
    ([, attributes, text]) => ({
      code: /\bcode="([^"]*)"/.exec(attributes)?.[1] ?? "",
      level: /\blevel="([^"]*)"/.exec(attributes)?.[1] ?? "",
      text: unescapeXml(text.replaceAll(/\s+/g, " ").trim()),
    }),
  );
  return { accepted: xml.includes("<rep:accept>"), messages, scenario };
}

async function main() {
  await mkdir(cacheDir, { recursive: true });
  const jar = await download(VALIDATOR);
  await ensureConfiguration();

  await rm(outDir, { force: true, recursive: true });
  await mkdir(outDir, { recursive: true });
  const names = Object.keys(XRECHNUNG_FIXTURES).sort();
  const files: Array<string> = [];
  for (const name of names) {
    const file = join(outDir, `${name}.xml`);
    await writeFile(file, generateXRechnung(XRECHNUNG_FIXTURES[name]()));
    files.push(file);
  }

  console.log(
    `KoSIT validator ${VALIDATOR_VERSION}, XRechnung ${XRECHNUNG_VERSION} configuration ${CONFIGURATION_DATE}, ${files.length} fixtures\n`,
  );
  const run = spawnSync(
    javaBinary(),
    ["-jar", jar, "-s", join(configDir, "scenarios.xml"), "-r", configDir, "-o", outDir, ...files],
    { encoding: "utf8" },
  );
  if (run.error) {
    throw new Error(
      `Could not start ${javaBinary()}: ${run.error.message}. Install Java 17 or set JAVA_HOME.`,
    );
  }
  // The validator exits non-zero on any reject; the reports decide below.

  let failed = false;
  const rows: Array<Record<string, string>> = [];
  const details: Array<string> = [];
  for (const name of names) {
    const reportPath = join(outDir, `${name}-report.xml`);
    if (!existsSync(reportPath)) {
      failed = true;
      rows.push({ errors: "-", fixture: name, result: "NO REPORT", scenario: "-", warnings: "-" });
      continue;
    }
    const report = parseReport(await readFile(reportPath, "utf8"));
    const errors = report.messages.filter((m) => m.level === "error");
    const warnings = report.messages.filter((m) => m.level === "warning");
    const ok = report.accepted && report.scenario !== null;
    failed ||= !ok;
    rows.push({
      errors: String(errors.length),
      fixture: name,
      result: report.scenario === null ? "NO SCENARIO" : report.accepted ? "accepted" : "REJECTED",
      scenario: report.scenario ?? "-",
      warnings: String(warnings.length),
    });
    for (const message of [...errors, ...warnings]) {
      details.push(`${name}: ${message.level} ${message.code}: ${message.text.slice(0, 200)}`);
    }
  }

  const columns = ["fixture", "scenario", "result", "errors", "warnings"];
  const width = Object.fromEntries(
    columns.map((c) => [c, Math.max(c.length, ...rows.map((r) => r[c].length))]),
  );
  const line = (row: Record<string, string>) =>
    `| ${columns.map((c) => row[c].padEnd(width[c])).join(" | ")} |`;
  console.log(line(Object.fromEntries(columns.map((c) => [c, c]))));
  console.log(`| ${columns.map((c) => "-".repeat(width[c])).join(" | ")} |`);
  for (const row of rows) {
    console.log(line(row));
  }
  if (details.length) {
    console.log(`\n${details.join("\n")}`);
  }
  console.log(`\nReports: ${outDir}`);

  if (failed) {
    if (run.stdout) {
      console.log(`\n${run.stdout}`);
    }
    if (run.stderr) {
      console.error(run.stderr);
    }
    console.error("XRechnung validation failed.");
    process.exit(1);
  }
  console.log("All XRechnung fixtures accepted.");
}

await main();
