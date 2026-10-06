import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const argument = process.argv[2];
assert(argument, "Usage: node scripts/smoke-package.mjs <tarball or npm package spec>");
const spec = argument.endsWith(".tgz") ? resolve(argument) : argument;
const directory = mkdtempSync(join(tmpdir(), "nota-mcp-package-"));
const env = { ...process.env, npm_config_cache: join(directory, "npm-cache") };
delete env.NODE_PATH;
const api = createServer((request, response) => {
  assert.equal(request.method, "GET", "Smoke checks must not mutate data");
  assert.equal(request.headers.authorization, "Bearer nota_package_smoke");
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify({
    data: [], pagination: { page: 1, perPage: 50, total: 0, totalPages: 0 },
  }));
});
await new Promise((done) => api.listen(0, "127.0.0.1", done));

try {
  writeFileSync(join(directory, "package.json"), JSON.stringify({ private: true, type: "module" }));
  execFileSync("npm", ["install", "--no-audit", "--no-fund", spec, "typescript", "@types/node"], {
    cwd: directory, env, stdio: "inherit",
  });
  writeFileSync(join(directory, "exports.mts"), `
import { NotaClient } from "@nota-app/mcp/client";
import { createNotaMcpServer } from "@nota-app/mcp/server";
import html from "@nota-app/mcp/invoice-app-html";
new NotaClient("http://localhost:1", "fixture");
createNotaMcpServer;
html satisfies string;
`);
  execFileSync(join(directory, "node_modules/.bin/tsc"), [
    "--noEmit", "--strict", "--module", "NodeNext", "--target", "ES2022", "--types", "node", "exports.mts",
  ], { cwd: directory, env, stdio: "inherit" });
  const load = (file) => import(pathToFileURL(join(directory, "node_modules/@nota-app/mcp/dist", file)));
  assert.equal(typeof (await load("client.js")).NotaClient, "function");
  assert.equal(typeof (await load("server.js")).createNotaMcpServer, "function");
  assert.match((await load("invoice-app-html.js")).default, /<script>/);

  for (const command of ["npx", "bunx"]) {
    const client = new Client({ name: "nota-package-smoke", version: "1.0.0" });
    const transport = new StdioClientTransport({
      command,
      args: ["--package", spec, "nota-mcp"],
      cwd: directory,
      env: {
        ...env,
        BUN_INSTALL_CACHE_DIR: join(directory, "bun-cache"),
        NOTA_URL: `http://127.0.0.1:${api.address().port}`,
        NOTA_API_KEY: "nota_package_smoke",
      },
      stderr: "inherit",
    });
    try {
      await client.connect(transport);
      assert((await client.listTools()).tools.some((tool) => tool.name === "list_invoices"));
      assert(!(await client.callTool({ name: "list_invoices", arguments: {} })).isError);
      assert((await client.listResources()).resources.some((resource) => resource.uri === "ui://nota/invoices.html"));
      const result = await client.readResource({ uri: "ui://nota/invoices.html" });
      assert.match(result.contents[0].text, /<script>/);
      console.log(`${command}: initialize, tools, resources and invoice UI passed`);
    } finally {
      await client.close();
    }
  }
  console.log("Package runtime exports and TypeScript declarations passed");
} finally {
  await new Promise((done) => api.close(done));
  rmSync(directory, { recursive: true, force: true });
}
