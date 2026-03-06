#!/usr/bin/env bun

const args = process.argv.slice(2);

if (args.includes("--help")) {
  console.log("nota CLI scaffold\n\nThis workspace is reserved for the future Nota command-line interface.");
  process.exit(0);
}

console.log("nota CLI scaffold");
