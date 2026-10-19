import { expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";

import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import type { XRechnungValidationError } from "@/lib/xrechnung";

// The renderers are covered by their own tests; here only the files that end
// up on the email matter.
mock.module("@/lib/invoice-pdf-service", () => ({
  InvoicePdfDataError: class extends Error {},
  renderInvoicePdfForOrg: async () => ({
    buffer: new Uint8Array(Buffer.from("%PDF-1.7 test")),
    clientName: "Max Kunde",
    filename: "inv-0007-kunde-2026-09.pdf",
    invoiceNumber: "INV-0007",
  }),
}));

let xrechnungFailure: XRechnungValidationError | null = null;
mock.module("@/lib/xrechnung-service", () => ({
  InvoiceDocumentError: class extends Error {},
  renderXRechnungForOrg: async () => {
    if (xrechnungFailure) {
      throw xrechnungFailure;
    }
    return { filename: "inv-0007-kunde-2026-09.xml", xml: '<?xml version="1.0"?><Invoice/>' };
  },
}));

// Issued originals live in invoice_documents plus the file store; both are in memory here.
type StoredRow = {
  contentType: string;
  filename: string;
  kind: "pdf" | "xrechnung";
  sha256: string;
  storageKey: string;
};
let storedRows: Array<StoredRow> = [];
const storedFiles = new Map<string, Buffer>();
let requestedKinds: Array<string> = [];
const dialect = new PgDialect();
mock.module("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (statement: SQL) => ({
          limit: async () => {
            const [orgId, invoiceId, kind] = dialect.sqlToQuery(statement).params;
            requestedKinds.push(String(kind));
            return storedRows.filter(
              (row) => orgId === "org_1" && invoiceId === "inv_1" && row.kind === kind,
            );
          },
        }),
      }),
    }),
  },
}));
// Only the three file operations are faked; the rest of the module stays real for its own tests.
const realFileStorage = await import("@/lib/file-storage");
mock.module("@/lib/file-storage", () => ({
  ...realFileStorage,
  deletePrivateFiles: async () => {},
  putPrivateFile: async () => {},
  readPrivateFile: async (key: string) => storedFiles.get(key) ?? null,
}));

function keep(kind: "pdf" | "xrechnung", content: string) {
  const bytes = Buffer.from(content, "utf8");
  const storageKey = `invoices/org_1/inv_1/INV-0007.${kind === "pdf" ? "pdf" : "xml"}`;
  storedFiles.set(storageKey, bytes);
  storedRows.push({
    contentType: kind === "pdf" ? "application/pdf" : "application/xml",
    filename: `stored-${kind}.${kind === "pdf" ? "pdf" : "xml"}`,
    kind,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    storageKey,
  });
}

const { renderInvoiceAttachments } = await import("./jobs");
const org = { id: "org_1" } as Parameters<typeof renderInvoiceAttachments>[0];

test("a German send carries the PDF and the XML under the same base name", async () => {
  const files = await renderInvoiceAttachments(org, "inv_1", ["pdf", "xml"]);
  expect(files.map(({ contentType, filename }) => ({ contentType, filename }))).toEqual([
    { contentType: "application/pdf", filename: "inv-0007-kunde-2026-09.pdf" },
    { contentType: "application/xml", filename: "inv-0007-kunde-2026-09.xml" },
  ]);
  expect(files[1].content.toString("utf8")).toContain("<Invoice/>");
});

test("a PDF-only send never renders the XML", async () => {
  const { XRechnungValidationError } = await import("@/lib/xrechnung");
  xrechnungFailure = new XRechnungValidationError(["Add a contact phone number."]);
  const files = await renderInvoiceAttachments(org, "inv_1", ["pdf"]);
  expect(files.map(({ filename }) => filename)).toEqual(["inv-0007-kunde-2026-09.pdf"]);
  xrechnungFailure = null;
});

test("an incomplete XML fails the job instead of sending the PDF alone", async () => {
  const { XRechnungValidationError } = await import("@/lib/xrechnung");
  xrechnungFailure = new XRechnungValidationError(["Add a contact phone number."]);
  await expect(renderInvoiceAttachments(org, "inv_1", ["pdf", "xml"])).rejects.toThrow(
    "Add a contact phone number.",
  );
  xrechnungFailure = null;
});

test("an issued invoice attaches the stored originals, not a fresh rendering", async () => {
  storedRows = [];
  requestedKinds = [];
  keep("pdf", "%PDF-1.7 what the customer got");
  keep("xrechnung", '<?xml version="1.0"?><Invoice>original</Invoice>');
  const files = await renderInvoiceAttachments(org, "inv_1", ["pdf", "xml"]);
  expect(files.map(({ filename }) => filename)).toEqual(["stored-pdf.pdf", "stored-xrechnung.xml"]);
  expect(files[0].content.toString("utf8")).toBe("%PDF-1.7 what the customer got");
  expect(files[1].content.toString("utf8")).toContain("<Invoice>original</Invoice>");
  expect(requestedKinds).toEqual(["pdf", "xrechnung"]);
  storedRows = [];
});

test("a recorded original whose file is gone fails the job rather than re-rendering", async () => {
  storedRows = [];
  keep("pdf", "%PDF-1.7 lost");
  storedFiles.clear();
  await expect(renderInvoiceAttachments(org, "inv_1", ["pdf"])).rejects.toThrow(
    "missing from storage",
  );
  storedRows = [];
});
