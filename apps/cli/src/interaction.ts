import { Command, InvalidArgumentError } from "commander";
import type { PaginatedResult } from "@nota-app/sdk";
import { createUI, outputOptions } from "./output/shared.js";

export const interactive = () =>
  Boolean(
    process.stdin.isTTY &&
    process.stderr.isTTY &&
    !process.env.CI &&
    !outputOptions().json &&
    outputOptions().input !== false,
  );
export function requireInput(flags: string) {
  if (!interactive())
    throw new Error(
      `Missing input. Provide ${flags}; prompts need an interactive terminal without --json or --no-input.`,
    );
}
export const promptContext = { output: process.stderr };
export function promptTheme() {
  const u = createUI();
  return {
    prefix: { idle: u.accent("?"), done: u.accent("✓") },
    style: {
      answer: (value: string) => u.accent(value),
      highlight: (value: string) => u.accent(value),
      message: (value: string) => u.c.bold(value),
    },
  };
}
export async function approve(message: string) {
  if (outputOptions().yes) return true;
  if (!interactive())
    throw new Error("Review with --dry-run first, then pass --yes to confirm. No changes made.");
  const { confirm } = await import("@inquirer/prompts");
  return confirm({ message, default: false, theme: promptTheme() }, promptContext);
}
export function options<T>(command: Command): T {
  return command.optsWithGlobals() as T;
}
export type ListOptions = { page?: number; perPage?: number; all?: boolean };
function positive(value: string) {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1)
    throw new InvalidArgumentError("Use a positive integer.");
  return Number(value);
}
export function paginationOptions(command: Command) {
  return command
    .option("--page <number>", "Page to fetch", positive)
    .option("--per-page <number>", "Records per page (1–100)", (value) => {
      const n = positive(value);
      if (n > 100) throw new InvalidArgumentError("Use 1–100 records per page.");
      return n;
    })
    .option("--all", "Fetch every matching page");
}
export async function collectPages<T>(
  fetchPage: (page: number, perPage: number) => Promise<PaginatedResult<T>>,
  options: ListOptions,
): Promise<PaginatedResult<T> & { all?: boolean }> {
  if (options.all && options.page !== undefined)
    throw new Error("Choose --all or --page, not both.");
  const first = await fetchPage(options.page ?? 1, options.perPage ?? 20);
  if (!options.all) return first;
  const data = [...first.data];
  let current = first;
  while (current.pagination.page * current.pagination.perPage < current.pagination.total) {
    if (current.data.length === 0 || current.pagination.perPage < 1)
      throw new Error("Pagination stopped making progress. Retry the list.");
    const next = await fetchPage(current.pagination.page + 1, current.pagination.perPage);
    if (next.pagination.page <= current.pagination.page)
      throw new Error("The server returned the same page twice.");
    data.push(...next.data);
    current = next;
  }
  return { data, pagination: { ...first.pagination, total: current.pagination.total }, all: true };
}
