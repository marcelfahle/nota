import { expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";

import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import { XRechnungValidationError } from "@/lib/xrechnung";

// The live renderers answer with whatever the rows say right now; the stored
// original must win over them for an issued invoice.
let livePdf = "%PDF-1.7 rendered from live rows";
let liveXml: string | XRechnungValidationError = '<?xml version="1.0"?><Invoice>live</Invoice>';
mock.module("@/lib/invoice-pdf-service", () => ({
  InvoicePdfDataError: class extends Error {},
  renderInvoicePdfForOrg: async () => ({
    buffer: new Uint8Array(Buffer.from(livePdf)),
    clientName: "Max Kunde",
    filename: "inv-0007-kunde-2026-09.pdf",
    invoiceNumber: "INV-0007",
  }),
}));
mock.module("@/lib/xrechnung-service", () => ({
  InvoiceDocumentError: class extends Error {},
  renderXRechnungForOrg: async () => {
    if (liveXml instanceof XRechnungValidationError) {
      throw liveXml;
    }
    return { filename: "inv-0007-kunde-2026-09.xml", xml: liveXml };
  },
}));

type Row = Record<string, unknown> & { invoiceId: string; kind: string; orgId: string };
let rows: Array<Row> = [];
const files = new Map<string, { content: Buffer; contentType: string }>();
const dialect = new PgDialect();
mock.module("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (statement: SQL) => {
          const [orgId, invoiceId, kind] = dialect.sqlToQuery(statement).params;
          const matching = rows.filter(
            (row) => row.orgId === orgId && row.invoiceId === invoiceId && row.kind === kind,
          );
          return { limit: async () => matching };
        },
      }),
    }),
  },
}));
// Only the three file operations are faked; the rest of the module stays real for its own tests.
const realFileStorage = await import("@/lib/file-storage");
mock.module("@/lib/file-storage", () => ({
  ...realFileStorage,
  deletePrivateFiles: async (keys: Array<string>) => {
    for (const key of keys) {
      files.delete(key);
    }
  },
  putPrivateFile: async (key: string, content: Buffer, contentType: string) => {
    files.set(key, { content, contentType });
  },
  readPrivateFile: async (key: string) => files.get(key)?.content ?? null,
}));

const {
  deleteInvoiceDocumentFiles,
  invoiceDocumentKey,
  loadInvoicePdf,
  loadInvoiceXml,
  storeIssuedDocuments,
} = await import("./invoice-documents");

const orgId = "0f72f87b-3d4d-4f4b-85f8-f469e835c708";
const invoiceId = "7a1d3e8c-1111-4b2b-9c3d-0a0a0a0a0a0a";
const org = { id: orgId } as Parameters<typeof loadInvoicePdf>[0];
const tx = {
  insert: () => ({
    values: async (inserted: Array<Row>) => {
      rows.push(...inserted);
    },
  }),
  select: () => {
    throw new Error("The renderers are mocked; nothing should query here");
  },
} as unknown as Parameters<typeof storeIssuedDocuments>[0];

function sha256(content: string) {
  return createHash("sha256").update(Buffer.from(content)).digest("hex");
}

test("storage keys stay inside the invoice's folder whatever the number looks like", () => {
  expect(invoiceDocumentKey(orgId, invoiceId, "RE 2026/0007", "pdf")).toBe(
    `invoices/${orgId}/${invoiceId}/RE-2026-0007.pdf`,
  );
  expect(invoiceDocumentKey(orgId, invoiceId, "../../etc/passwd", "xrechnung")).toBe(
    `invoices/${orgId}/${invoiceId}/etc-passwd.xml`,
  );
  expect(() => invoiceDocumentKey("../other", invoiceId, "INV-1", "pdf")).toThrow(
    "Invalid invoice document path",
  );
});

test("issuance stores the PDF and the XML with their hashes and sizes", async () => {
  rows = [];
  files.clear();
  const stored = await storeIssuedDocuments(
    tx,
    org,
    { id: invoiceId, number: "INV-0007" },
    { attachXml: true },
  );
  expect(stored.map(({ filename, kind, storageKey }) => ({ filename, kind, storageKey }))).toEqual([
    {
      filename: "inv-0007-kunde-2026-09.pdf",
      kind: "pdf",
      storageKey: `invoices/${orgId}/${invoiceId}/INV-0007.pdf`,
    },
    {
      filename: "inv-0007-kunde-2026-09.xml",
      kind: "xrechnung",
      storageKey: `invoices/${orgId}/${invoiceId}/INV-0007.xml`,
    },
  ]);
  expect(stored[0].sha256).toBe(sha256(livePdf));
  expect(stored[0].byteSize).toBe(Buffer.byteLength(livePdf));
  expect(stored[1].contentType).toBe("application/xml");
  expect(files.get(stored[1].storageKey)?.content.toString("utf8")).toBe(liveXml as string);
  expect(rows).toHaveLength(2);
});

test("an optional XML that does not validate is simply not stored; a required one fails issuance", async () => {
  rows = [];
  files.clear();
  liveXml = new XRechnungValidationError([
    "Add a contact phone number for your business in Settings.",
  ]);
  const stored = await storeIssuedDocuments(
    tx,
    org,
    { id: invoiceId, number: "INV-0008" },
    { attachXml: false },
  );
  expect(stored.map(({ kind }) => kind)).toEqual(["pdf"]);
  await expect(
    storeIssuedDocuments(tx, org, { id: invoiceId, number: "INV-0008" }, { attachXml: true }),
  ).rejects.toThrow("Add a contact phone number");
  liveXml = '<?xml version="1.0"?><Invoice>live</Invoice>';
});

test("downloads serve the stored bytes even after the live data changed", async () => {
  rows = [];
  files.clear();
  const original = livePdf;
  await storeIssuedDocuments(tx, org, { id: invoiceId, number: "INV-0009" }, { attachXml: true });
  // The client moves; a fresh rendering would now differ.
  livePdf = "%PDF-1.7 rendered after the client changed address";
  liveXml = '<?xml version="1.0"?><Invoice>new address</Invoice>';

  const pdf = await loadInvoicePdf(org, invoiceId);
  expect(pdf.stored).toBe(true);
  expect(Buffer.from(pdf.buffer).toString("utf8")).toBe(original);
  expect(sha256(Buffer.from(pdf.buffer).toString("utf8"))).toBe(sha256(original));
  expect(pdf.filename).toBe("inv-0007-kunde-2026-09.pdf");

  const xml = await loadInvoiceXml(org, invoiceId);
  expect(xml.stored).toBe(true);
  expect(xml.xml).toContain("<Invoice>live</Invoice>");
  livePdf = original;
  liveXml = '<?xml version="1.0"?><Invoice>live</Invoice>';
});

test("a draft, or an invoice issued before originals were kept, renders live", async () => {
  rows = [];
  files.clear();
  livePdf = "%PDF-1.7 draft preview";
  const pdf = await loadInvoicePdf(org, invoiceId);
  expect(pdf.stored).toBe(false);
  expect(Buffer.from(pdf.buffer).toString("utf8")).toBe("%PDF-1.7 draft preview");
  const xml = await loadInvoiceXml(org, invoiceId);
  expect(xml.stored).toBe(false);
  expect(xml.xml).toContain("<Invoice>live</Invoice>");
});

test("a stored original is served only to its own workspace", async () => {
  rows = [];
  files.clear();
  await storeIssuedDocuments(tx, org, { id: invoiceId, number: "INV-0010" }, { attachXml: false });
  const other = { id: "11111111-2222-4333-8444-555555555555" } as typeof org;
  const pdf = await loadInvoicePdf(other, invoiceId);
  expect(pdf.stored).toBe(false);
});

test("a tampered or missing file is an error, never a quiet re-render", async () => {
  rows = [];
  files.clear();
  const [pdf] = await storeIssuedDocuments(
    tx,
    org,
    { id: invoiceId, number: "INV-0011" },
    { attachXml: false },
  );
  files.set(pdf.storageKey, { content: Buffer.from("%PDF-1.7 altered"), contentType: "x" });
  await expect(loadInvoicePdf(org, invoiceId)).rejects.toThrow("does not match its recorded hash");
  await deleteInvoiceDocumentFiles([pdf.storageKey]);
  await expect(loadInvoicePdf(org, invoiceId)).rejects.toThrow("missing from storage");
});
