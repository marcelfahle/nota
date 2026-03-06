import chalk from "chalk";

export function printConfig(config: { apiKey?: string | null; path: string; url?: string }) {
  console.log(chalk.bold("Nota CLI config"));
  console.log(`Path: ${config.path}`);
  console.log(`URL: ${config.url ?? chalk.gray("not set")}`);
  console.log(`API key: ${config.apiKey ?? chalk.gray("not set")}`);
}
