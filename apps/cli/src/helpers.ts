import { input, select } from "@inquirer/prompts";

import type { ClientRecord, InvoiceDetail, NotaApiError, NotaClient } from "@nota-app/sdk";

import { createConfiguredClient } from "./config.js";

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function formatDateInput(date: Date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());

  return `${year}-${month}-${day}`;
}

export function getDefaultInvoiceDates() {
  const issuedAtDate = new Date();
  const dueAtDate = new Date(issuedAtDate);
  dueAtDate.setDate(dueAtDate.getDate() + 30);

  return {
    dueAt: formatDateInput(dueAtDate),
    issuedAt: formatDateInput(issuedAtDate),
  };
}

export async function requireClient() {
  return createConfiguredClient();
}

export async function resolveClientReference(client: NotaClient, reference: string) {
  if (isUuid(reference)) {
    return client.getClient(reference);
  }

  const exactMatches = await client.findClientByName(reference);
  if (exactMatches.length === 1) {
    return exactMatches[0];
  }

  if (exactMatches.length > 1) {
    throw new Error(
      `Client '${reference}' is ambiguous. Matches: ${exactMatches.map((match) => `${match.name} [${match.id}]`).join(", ")}`,
    );
  }

  const searchResult = await client.listClients({ perPage: 20, search: reference });
  if (searchResult.data.length === 1) {
    return searchResult.data[0];
  }

  if (searchResult.data.length === 0) {
    throw new Error(`Client '${reference}' was not found.`);
  }

  throw new Error(
    `Client '${reference}' is ambiguous. Matches: ${searchResult.data
      .map((match) => `${match.name} [${match.id}]`)
      .join(", ")}`,
  );
}

export async function resolveInvoiceReference(client: NotaClient, reference: string) {
  if (isUuid(reference)) {
    return client.getInvoice(reference);
  }

  const invoice = await client.findInvoiceByNumber(reference);
  if (!invoice) {
    throw new Error(`Invoice '${reference}' was not found.`);
  }

  return invoice;
}

export async function promptForClient(client: NotaClient, seed?: string): Promise<ClientRecord> {
  const query = seed?.trim() || (await input({ message: "Client name or email" })).trim();
  if (!query) {
    throw new Error("Client is required.");
  }

  const exactMatches = await client.findClientByName(query);
  if (exactMatches.length === 1) {
    return exactMatches[0];
  }

  const searchResult = await client.listClients({ perPage: 20, search: query });
  if (searchResult.data.length === 0) {
    throw new Error(`No client matched '${query}'.`);
  }

  if (searchResult.data.length === 1) {
    return searchResult.data[0];
  }

  return select({
    choices: searchResult.data.map((entry) => ({
      name: `${entry.name} (${entry.email})${entry.company ? ` — ${entry.company}` : ""}`,
      value: entry,
    })),
    message: "Select a client",
  });
}

export function getCliErrorMessage(error: unknown) {
  const notaError = error as NotaApiError;
  if (notaError?.name === "NotaApiError") {
    return `Nota API error (${notaError.status}): ${notaError.message}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown CLI error";
}
