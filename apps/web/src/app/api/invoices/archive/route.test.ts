import { beforeEach, expect, mock, test } from "bun:test";

const renderInvoicePdfForOrg = mock(
  async (_org: unknown, invoiceId: string) => ({
    buffer: new Uint8Array([1, 2, 3]),
    clientName: "Acme",
    filename: `2026-04-01_${invoiceId}_Acme.pdf`,
    invoiceNumber: invoiceId,
  }),
);

let exportRows: Array<{
  clientName: string;
  id: string;
  issuedAt: string;
  number: string;
}> = [];
let receivedFilters: { period?: { key?: string } } | undefined;

mock.module("@/lib/auth", () => ({
  getCurrentUser: async () => ({
    org: {
      businessAddress: null,
      businessName: "Nota Studio",
      id: "org-1",
      logoUrl: null,
      name: "Nota Studio",
      vatNumber: null,
    },
  }),
}));

mock.module("@/lib/branding", () => ({
  getPdfLogoSrc: async () => null,
}));

mock.module("@/lib/db/schema", () => ({
  invoiceStatusEnum: {
    enumValues: ["cancelled", "draft", "overdue", "paid", "sent"],
  },
}));

mock.module("@/lib/invoice-export", () => ({
  listInvoicesForExport: async (_orgId: string, filters: unknown) => {
    receivedFilters = filters as typeof receivedFilters;
    return exportRows;
  },
  MAX_INVOICE_ARCHIVE_SIZE: 100,
}));

mock.module("@/lib/invoice-pdf-service", () => {
  class InvoicePdfDataError extends Error {
    readonly status = 404;
  }

  return { InvoicePdfDataError, renderInvoicePdfForOrg };
});

const { GET } = await import("./route");

beforeEach(() => {
  exportRows = [];
  receivedFilters = undefined;
  renderInvoicePdfForOrg.mockClear();
});

test("archive route infers a custom period from bare dates", async () => {
  exportRows = [
    {
      clientName: "Acme",
      id: "inv-1",
      issuedAt: "2026-04-01",
      number: "INV-1",
    },
  ];

  const response = await GET(
    new Request(
      "http://nota.test/api/invoices/archive?from=2026-04-01&to=2026-06-30",
    ),
  );

  expect(response.status).toBe(200);
  expect(receivedFilters?.period?.key).toBe("custom");
  expect(response.headers.get("content-type")).toBe("application/zip");
  expect(response.headers.get("content-disposition")).toContain(
    "nota-invoices_2026-04-01_to_2026-06-30.zip",
  );
  expect(renderInvoicePdfForOrg).toHaveBeenCalledTimes(1);
});

test("archive route asks large exports to be narrowed before rendering", async () => {
  exportRows = Array.from({ length: 101 }, (_, index) => ({
    clientName: "Acme",
    id: `inv-${index}`,
    issuedAt: "2026-04-01",
    number: `INV-${index}`,
  }));

  const response = await GET(
    new Request("http://nota.test/api/invoices/archive?period=all"),
  );

  expect(response.status).toBe(413);
  await expect(response.json()).resolves.toEqual({
    error:
      "This archive has more than 100 invoices. Choose a shorter period, one client, or a status.",
  });
  expect(renderInvoicePdfForOrg).not.toHaveBeenCalled();
});
