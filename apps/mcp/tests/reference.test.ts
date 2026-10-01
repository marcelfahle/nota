import { expect, test } from "bun:test";
import { NotaClient } from "../src/client.js";

function clientFor(numbers: string[]) {
  return new NotaClient("https://nota.test", "nota_test", (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/v1/invoices")
      return Response.json({
        data: numbers.map((number) => ({ id: number, number })),
        pagination: { page: 1, perPage: 100, total: numbers.length },
      });
    return Response.json({
      data: {
        id: decodeURIComponent(url.pathname.split("/").at(-1)!),
        number: decodeURIComponent(url.pathname.split("/").at(-1)!),
      },
    });
  }) as typeof fetch);
}
test("short invoice numbers resolve padding and prefixes without matching unrelated numbers", async () => {
  expect((await clientFor(["0000097", "0000197"]).findInvoiceByNumber("97"))?.number).toBe(
    "0000097",
  );
  expect((await clientFor(["INV-0097"]).findInvoiceByNumber("97"))?.number).toBe("INV-0097");
  await expect(clientFor(["2025-0097", "2026-0097"]).findInvoiceByNumber("97")).rejects.toThrow(
    "ambiguous",
  );
  expect(
    (await clientFor(["2025-0097", "2026-0097"]).findInvoiceByNumber("2026-0097"))?.number,
  ).toBe("2026-0097");
});
