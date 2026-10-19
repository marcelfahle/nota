import { build } from "esbuild";
import { cpSync, readFileSync, writeFileSync } from "node:fs";

// Keep the unpublished workspace SDK inside the package, including its public types.
await build({
  entryPoints: ["src/client.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: "dist/client.js",
});
cpSync("../../packages/sdk/dist", "dist/sdk", {
  recursive: true,
  filter: (source) => !source.endsWith(".js"),
});
const declarations = readFileSync("dist/client.d.ts", "utf8");
writeFileSync("dist/client.d.ts", declarations.replaceAll("@nota-app/sdk", "./sdk/index.js"));
