import chalk from "chalk";

function pad(value: string, width: number) {
  return value.length >= width ? value : `${value}${" ".repeat(width - value.length)}`;
}

function truncate(value: string, width: number) {
  return value.length > width ? `${value.slice(0, Math.max(1, width - 1))}…` : value;
}

export function formatCurrency(total: string | null | undefined, currency: string | null | undefined) {
  const amount = Number(total ?? 0);
  const isoCurrency = currency ?? "EUR";

  try {
    return new Intl.NumberFormat("en", {
      currency: isoCurrency,
      style: "currency",
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${isoCurrency}`;
  }
}

export function printSuccess(message: string) {
  console.log(chalk.green(message));
}

export function printTable(headers: Array<string>, rows: Array<Array<string>>) {
  if (rows.length === 0) {
    console.log(chalk.gray("No results."));
    return;
  }

  const widths = headers.map((header, index) => {
    const cellWidths = rows.map((row) => row[index]?.length ?? 0);
    return Math.max(header.length, ...cellWidths);
  });

  const headerLine = headers
    .map((header, index) => pad(header, widths[index]))
    .join("  ");
  const separator = widths.map((width) => "-".repeat(width)).join("  ");

  console.log(chalk.bold(headerLine));
  console.log(chalk.gray(separator));

  for (const row of rows) {
    console.log(
      row
        .map((cell, index) => pad(truncate(cell, widths[index]), widths[index]))
        .join("  "),
    );
  }
}

export function printWarning(message?: string) {
  if (!message) {
    return;
  }

  console.log(chalk.yellow(message));
}
