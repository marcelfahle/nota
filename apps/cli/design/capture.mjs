// Capture real preview output into a portable, dependency-free review artifact.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const entry = fileURLToPath(new URL("./index.ts", import.meta.url));
const destination = new URL("../../../docs/design/nota-cli-preview.html", import.meta.url);
const escape = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
function ansiHtml(value) {
  let color = "inherit",
    bold = false,
    result = "",
    cursor = 0;
  for (const match of value.matchAll(/\x1b\[([0-9;]*)m/g)) {
    result += `<span style="color:${color};font-weight:${bold ? 600 : 400}">${escape(value.slice(cursor, match.index))}</span>`;
    const codes = match[1].split(";").map(Number);
    for (let i = 0; i < codes.length; i++) {
      const code = codes[i];
      if (code === 0) {
        color = "inherit";
        bold = false;
      }
      if (code === 1) bold = true;
      if (code === 22) bold = false;
      if (code === 39) color = "inherit";
      if (code === 90) color = "#93998e";
      if (code === 33) color = "#e4bd72";
      if (code === 36) color = "#85c4cd";
      if (code === 38 && codes[i + 1] === 2) {
        color = `rgb(${codes.slice(i + 2, i + 5).join(",")})`;
        i += 4;
      }
    }
    cursor = match.index + match[0].length;
  }
  return result + escape(value.slice(cursor));
}
const env = { ...process.env, FORCE_COLOR: "3", TERM: "xterm-256color" };
delete env.NO_COLOR;
const screens = [
  ["Overview", []],
  ["Invoices", ["invoices"]],
  ["Draft", ["invoices", "show", "INV-0044"]],
  ["Delivery", ["invoices", "send", "INV-0044", "--dry-run"]],
  ["First run", ["welcome"]],
].map(([name, args]) => {
  const result = spawnSync("bun", [entry, ...args, "--width", "88"], { env, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  return {
    name,
    command: `nota ${args.join(" ")}`.trim(),
    html: ansiHtml(result.stdout.trimEnd()),
  };
});
mkdirSync(new URL("./", destination), { recursive: true });
writeFileSync(
  destination,
  `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nota / terminal design</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#edefe7;color:#282d24;font-family:ui-sans-serif,system-ui,sans-serif;padding:40px}main{max-width:980px;margin:auto}header{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:24px}h1{font-size:23px;letter-spacing:-.8px;margin:0;font-weight:650}header p{font-size:12px;color:#686f60;margin:0}nav{display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap}button{border:1px solid #cdd1c5;background:transparent;color:#58604f;padding:8px 15px;border-radius:6px;cursor:pointer;font:inherit;font-size:12px}button[aria-selected=true]{background:#252b20;border-color:#252b20;color:#edeee7}button:focus-visible{outline:3px solid #6b811a;outline-offset:3px}.terminal{background:#191c17;border:1px solid #333b2b;border-radius:12px;overflow:hidden;box-shadow:0 18px 40px #333d2218}.bar{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #30362a;color:#959d8a;padding:14px 22px;font-size:11px;letter-spacing:.3px}.dot{display:inline-block;background:#d1fd39;width:6px;height:6px;border-radius:50%;margin-right:9px}.sample{font-size:9px;letter-spacing:1.5px;color:#a7b496}pre{margin:0;padding:8px 20px 24px;color:#edf0e7;font:14px/1.65 ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;font-variant-ligatures:none;overflow:auto;min-height:310px}.command{padding:16px 36px;background:#1e231b;border-top:1px solid #30362a;font:12px ui-monospace,monospace;color:#bdc8b2}.command span{color:#d1fd39;margin-right:12px}footer{font-size:11px;color:#6e7565;display:flex;justify-content:space-between;gap:20px;margin-top:22px;line-height:1.6}code{font-family:ui-monospace,monospace}article[hidden]{display:none}@media(max-width:700px){body{padding:20px 10px}header{display:block}header p{margin-top:8px}footer{display:block}pre{font-size:12px}}
</style><main><header><h1>nota <span style="font-weight:400;color:#89917e">/ terminal</span></h1><p>Design study · October 2026</p></header>
<nav aria-label="Preview screens">${screens.map((s, i) => `<button aria-selected="${i === 0}" aria-controls="screen-${i}" onclick="show(${i})">${s.name}</button>`).join("")}</nav>
<div class="terminal"><div class="bar"><span><i class="dot"></i>nota — sample workspace</span><span class="sample">OFFLINE PREVIEW</span></div>
${screens.map((s, i) => `<article id="screen-${i}" ${i ? "hidden" : ""}><pre>${s.html}</pre><div class="command"><span>❯</span>${escape(s.command)}</div></article>`).join("")}</div>
<footer><span>Captured from the runnable CLI. Sample data; no account or network required.</span><code>bun run --cwd apps/cli preview</code></footer></main>
<script>function show(index){document.querySelectorAll('article').forEach((el,i)=>el.hidden=i!==index);document.querySelectorAll('nav button').forEach((el,i)=>el.setAttribute('aria-selected',String(i===index)))}</script></html>`,
);
console.log(fileURLToPath(destination));
