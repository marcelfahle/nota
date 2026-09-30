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
const html = readFileSync("src/ui/invoices.html", "utf8");
writeFileSync(
  "dist/invoice-app.html",
  html.replace(
    "<!-- APP_SCRIPT -->",
    () => `<script>${result.outputFiles[0].text.replaceAll("</script", "<\\/script")}</script>`,
  ),
);
