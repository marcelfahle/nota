import { expect, test } from "bun:test";

import { maskApiKey } from "../src/config";
import { getCliErrorMessage, resolveClientReference } from "../src/helpers";

test("resolveClientReference falls back from exact-name lookup to search", async () => {
  const client = {
    findClientByName: async () => [],
    getClient: async () => {
      throw new Error("should not use getClient for non-UUID references");
    },
    listClients: async () => ({
      data: [
        {
          company: "Acme GmbH",
          defaultCurrency: "EUR",
          email: "billing@acme.test",
          id: "client_1",
          invoiceCount: 0,
          name: "Acme GmbH",
          totalInvoiced: "0.00",
        },
      ],
      pagination: { page: 1, perPage: 20, total: 1 },
    }),
  };

  await expect(resolveClientReference(client as never, "Acme")).resolves.toMatchObject({
    id: "client_1",
    name: "Acme GmbH",
  });
});

test("resolveClientReference rejects ambiguous matches", async () => {
  const client = {
    findClientByName: async () => [
      { email: "first@example.com", id: "client_1", name: "Acme" },
      { email: "second@example.com", id: "client_2", name: "Acme" },
    ],
    getClient: async () => {
      throw new Error("should not use getClient for non-UUID references");
    },
    listClients: async () => ({ data: [], pagination: { page: 1, perPage: 20, total: 0 } }),
  };

  await expect(resolveClientReference(client as never, "Acme")).rejects.toThrow(
    "Client 'Acme' is ambiguous. Matches: Acme [client_1], Acme [client_2]",
  );
});

test("CLI helpers format API errors and masked keys for terminal output", () => {
  expect(getCliErrorMessage({ message: "Forbidden", name: "NotaApiError", status: 403 })).toBe(
    "Nota API error (403): Forbidden",
  );
  expect(maskApiKey("nota_abcdefghijklmnopqrstuvwxyz")).toBe("nota_a…wxyz");
  expect(maskApiKey("nota_short")).toBe("no…rt");
});
