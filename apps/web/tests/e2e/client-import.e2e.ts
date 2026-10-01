import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";
import tailwind from "@tailwindcss/postcss";
import { build } from "esbuild";
import postcss from "postcss";

import { previewClientImport } from "../../src/lib/client-import";

// Mount the real chat UI with its styles. Only navigation and HTTP are fixtures;
// this browser test cannot access customer data, send emails, or call a model.
let html: string;
const csv =
  'Organization,Email,Notes,Phone\nRanger GmbH,invoice@ranger.test,"Literal <img src=x onerror=alert(1)>",123\nAcme,billing@acme.test,,456\nMissing Email,,,\n';
test.beforeAll(async () => {
  const cwd = process.cwd();
  const [bundle, styles] = await Promise.all([
    build({
      absWorkingDir: cwd,
      bundle: true,
      define: { "process.env.NODE_ENV": '"development"' },
      format: "iife",
      jsx: "automatic",
      plugins: [
        {
          name: "fixture-navigation",
          setup(builder) {
            builder.onResolve({ filter: /^next\/navigation$/ }, () => ({
              namespace: "fixture",
              path: "navigation",
            }));
            builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
              contents: "export function useRouter() { return {refresh() {}}; }",
              loader: "js",
            }));
          },
        },
      ],
      stdin: {
        contents:
          'import React from "react"; import {createRoot} from "react-dom/client"; import {ChatPanel} from "./src/components/chat-panel"; createRoot(document.getElementById("root")).render(<ChatPanel />);',
        loader: "tsx",
        resolveDir: cwd,
      },
      write: false,
    }),
    readFile(join(cwd, "src/app/globals.css"), "utf8").then((css) =>
      postcss([tailwind({ base: cwd })]).process(css, { from: join(cwd, "src/app/globals.css") }),
    ),
  ]);
  html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles.css}</style><style>body{font-family:Arial,sans-serif;background:#fafafa}</style><div id="root"></div><script>${bundle.outputFiles[0].text.replaceAll("</script", String.raw`<\/script`)}</script>`;
});

async function openChat(page: Page, stale = false, nonJson?: "preview" | "commit") {
  const requests: Array<{ csv: string; mode: string; previewHash?: string }> = [];
  let existing = [{ email: "billing@acme.test", name: "Acme" }];
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.url().endsWith("/api/clients/import")) {
      const body = request.postDataJSON();
      requests.push(body);
      if (body.mode === nonJson) {
        await route.fulfill({
          body: "<html>Upstream unavailable</html>",
          contentType: "text/html",
          status: 503,
        });
        return;
      }
      if (stale && body.mode === "commit") {
        existing = [...existing, { email: "invoice@ranger.test", name: "Ranger GmbH" }];
        await route.fulfill({
          body: JSON.stringify({
            data: previewClientImport(body.csv, existing),
            error: "Your client list changed. Review the refreshed preview before adding clients.",
          }),
          contentType: "application/json",
          status: 409,
        });
      } else {
        try {
          const preview = previewClientImport(body.csv, existing);
          expect(body.mode === "preview" || body.previewHash === preview.hash).toBe(true);
          await route.fulfill({
            body: JSON.stringify({
              data:
                body.mode === "preview"
                  ? preview
                  : { added: preview.counts.ready, counts: preview.counts, stale: false },
            }),
            contentType: "application/json",
          });
        } catch (error) {
          await route.fulfill({
            body: JSON.stringify({ error: error instanceof Error ? error.message : "Invalid CSV" }),
            contentType: "application/json",
            status: 400,
          });
        }
      }
      return;
    }
    if (request.resourceType() === "document") {
      await route.fulfill({ body: html, contentType: "text/html" });
      return;
    }
    throw new Error(`Unexpected browser request: ${request.url()}`);
  });
  await page.goto("/csv-proof");
  await page.getByTestId("chat-panel-toggle").click();
  return requests;
}

test("chat CSV preview, billing details, explicit import, and receipt work on desktop and mobile", async ({
  page,
}, info) => {
  const requests = await openChat(page);
  await page.getByTestId("client-csv-input").setInputFiles({
    buffer: Buffer.from(csv),
    mimeType: "text/csv",
    name: "freshbooks-clients.csv",
  });
  await expect(page.getByText("1 new client ready.")).toBeVisible();
  expect(requests.filter((request) => request.mode === "commit").length).toBe(0);
  await page.locator("summary").click();
  await expect(page.getByText("Unused columns: Phone")).toBeVisible();
  await expect(page.getByText("Literal <img src=x onerror=alert(1)>")).toBeVisible();
  await expect(page.locator("img")).toHaveCount(0);
  await info.attach("CSV import desktop", {
    body: await page.screenshot({ path: info.outputPath("client-csv-desktop.png") }),
    contentType: "image/png",
  });
  await page.setViewportSize({ height: 844, width: 390 });
  await expect(page.getByRole("button", { exact: true, name: "Add 1 client" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await info.attach("CSV import mobile", {
    body: await page.screenshot({ path: info.outputPath("client-csv-mobile.png") }),
    contentType: "image/png",
  });
  await page
    .getByRole("button", { exact: true, name: "Add 1 client" })
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
  await expect(
    page.getByText("Added", { exact: false }).filter({ has: page.locator("strong") }),
  ).toBeVisible();
  expect(requests.filter((request) => request.mode === "commit").length).toBe(1);
  await expect(page.getByRole("button", { name: "Attach client CSV" })).toBeEnabled();
});

for (const mode of ["preview", "commit"] as const) {
  test(`chat explains a non-JSON ${mode} failure and allows recovery`, async ({ page }) => {
    const requests = await openChat(page, false, mode);
    await page.getByTestId("client-csv-input").setInputFiles({
      buffer: Buffer.from(csv),
      mimeType: "text/csv",
      name: "clients.csv",
    });
    if (mode === "commit") {
      await page.getByRole("button", { exact: true, name: "Add 1 client" }).click();
    }
    await expect(page.getByRole("alert")).toHaveText(
      mode === "preview"
        ? "This file could not be read."
        : "The import could not finish. Try again.",
    );
    if (mode === "commit") {
      await expect(page.getByRole("button", { exact: true, name: "Add 1 client" })).toBeEnabled();
    }
    expect(requests.filter((request) => request.mode === "commit")).toHaveLength(
      mode === "commit" ? 1 : 0,
    );
    await expect(
      page.getByText("Added", { exact: false }).filter({ has: page.locator("strong") }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Dismiss CSV import" }).click();
    await expect(page.getByRole("button", { name: "Attach client CSV" })).toBeEnabled();
  });
}

test("chat refreshes a stale import preview without saving and explains invalid files", async ({
  page,
}) => {
  const requests = await openChat(page, true);
  await page
    .getByTestId("client-csv-input")
    .setInputFiles({ buffer: Buffer.from(csv), mimeType: "text/csv", name: "clients.csv" });
  await page.getByRole("button", { exact: true, name: "Add 1 client" }).click();
  await expect(page.getByRole("alert")).toContainText("client list changed");
  await expect(page.getByRole("button", { name: "Add 0 clients" })).toBeDisabled();
  expect(requests.filter((request) => request.mode === "commit").length).toBe(1);
  await page.getByRole("button", { name: "Dismiss CSV import" }).click();
  await page.getByTestId("client-csv-input").setInputFiles({
    buffer: Buffer.from("Invoice Number,Total\n97,1000"),
    mimeType: "text/csv",
    name: "invoices.csv",
  });
  await expect(page.getByRole("alert")).toContainText("client CSV");
});
