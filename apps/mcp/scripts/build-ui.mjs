import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";

const result = await build({
  entryPoints: ["src/ui/invoices.ts"],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  target: "es2022",
  minify: true,
});
const html = readFileSync("src/ui/invoices.html", "utf8").replace(
  "<!-- APP_SCRIPT -->",
  () => `<script>${result.outputFiles[0].text.replaceAll("</script", "<\\/script")}</script>`,
);
writeFileSync("dist/invoice-app.html", html);
// Bundled hosts (the Next.js app) import the card instead of reading it from disk.
writeFileSync("dist/invoice-app-html.js", `export default ${JSON.stringify(html)};\n`);
writeFileSync("dist/invoice-app-html.d.ts", "declare const html: string;\nexport default html;\n");
