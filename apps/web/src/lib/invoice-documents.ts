import { createHash } from "node:crypto";

import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { invoiceDocuments } from "@/lib/db/schema";
import { deletePrivateFiles, putPrivateFile, readPrivateFile } from "@/lib/file-storage";
import type { InvoiceDocumentOrg } from "@/lib/invoice-document";
import { renderInvoicePdfForOrg } from "@/lib/invoice-pdf-service";
import { XRechnungValidationError } from "@/lib/xrechnung";
import { renderXRechnungForOrg } from "@/lib/xrechnung-service";

/**
 * Issued originals: the PDF and, when there is one, the XRechnung XML exactly as
 * the customer received them. Written once at issuance, never rewritten, and
 * served by every download path in preference to a fresh rendering.
 */

export type InvoiceDocumentKind = "pdf" | "xrechnung";

type IssuanceDatabase = Pick<typeof db, "insert" | "select">;

const CONTENT_TYPES: Record<InvoiceDocumentKind, string> = {
  pdf: "application/pdf",
  xrechnung: "application/xml",
};
const UUID = /^[0-9a-f-]{36}$/;

export function sha256Hex(content: Buffer) {
  return createHash("sha256").update(content).digest("hex");
}

/** `invoices/<orgId>/<invoiceId>/<number>.pdf|.xml`; the number is reduced to safe characters. */
export function invoiceDocumentKey(
  orgId: string,
  invoiceId: string,
  number: string,
  kind: InvoiceDocumentKind,
) {
  if (!UUID.test(orgId) || !UUID.test(invoiceId)) {
    throw new Error("Invalid invoice document path");
  }
  const safeNumber =
    number.replaceAll(/[^A-Za-z0-9._-]+/g, "-").replaceAll(/^[.-]+|[.-]+$/g, "") || "document";
  return `invoices/${orgId}/${invoiceId}/${safeNumber}.${kind === "pdf" ? "pdf" : "xml"}`;
}

/**
 * Renders and stores what the customer receives. Runs inside the issuance
 * transaction, after the row carries its number and snapshot, so the stored
 * file and the row agree. The PDF is always stored; the XML when the workspace
 * attaches it, or when the export validates anyway. A rendering or storage
 * failure throws, which rolls the issuance back: no number is consumed and
 * nothing was sent.
 */
export async function storeIssuedDocuments(
  tx: IssuanceDatabase,
  org: InvoiceDocumentOrg,
  invoice: { id: string; number: string },
  options: { attachXml: boolean; logoSrc?: string | null },
) {
  const pdf = await renderInvoicePdfForOrg(org, invoice.id, {
    database: tx,
    logoSrc: options.logoSrc,
  });
  const files: Array<{ content: Buffer; filename: string; kind: InvoiceDocumentKind }> = [
    { content: Buffer.from(pdf.buffer), filename: pdf.filename, kind: "pdf" },
  ];
  const xml = await renderXmlWhenComplete(tx, org, invoice.id, options.attachXml);
  if (xml) {
    files.push({
      content: Buffer.from(xml.xml, "utf8"),
      filename: xml.filename,
      kind: "xrechnung",
    });
  }

  const rows = files.map((file) => ({
    byteSize: file.content.byteLength,
    contentType: CONTENT_TYPES[file.kind],
    filename: file.filename,
    invoiceId: invoice.id,
    kind: file.kind,
    orgId: org.id,
    sha256: sha256Hex(file.content),
    storageKey: invoiceDocumentKey(org.id, invoice.id, invoice.number, file.kind),
  }));
  for (const [index, row] of rows.entries()) {
    await putPrivateFile(row.storageKey, files[index].content, row.contentType);
  }
  await tx.insert(invoiceDocuments).values(rows);
  return rows;
}

async function renderXmlWhenComplete(
  tx: IssuanceDatabase,
  org: InvoiceDocumentOrg,
  invoiceId: string,
  required: boolean,
) {
  try {
    return await renderXRechnungForOrg(org, invoiceId, { database: tx });
  } catch (error) {
    // Sending already validated a required XML; an optional one is simply not stored.
    if (!required && error instanceof XRechnungValidationError) {
      return null;
    }
    throw error;
  }
}

export async function listInvoiceDocuments(orgId: string, invoiceId: string) {
  return db
    .select({
      byteSize: invoiceDocuments.byteSize,
      createdAt: invoiceDocuments.createdAt,
      filename: invoiceDocuments.filename,
      id: invoiceDocuments.id,
      kind: invoiceDocuments.kind,
      sha256: invoiceDocuments.sha256,
    })
    .from(invoiceDocuments)
    .where(and(eq(invoiceDocuments.orgId, orgId), eq(invoiceDocuments.invoiceId, invoiceId)))
    .orderBy(asc(invoiceDocuments.kind));
}

/**
 * The stored original, or null when the invoice has none (a draft, or a
 * document issued before originals were kept). A recorded original whose file
 * is missing or altered is an error, never a silent re-render.
 */
export async function readStoredInvoiceDocument(
  orgId: string,
  invoiceId: string,
  kind: InvoiceDocumentKind,
) {
  const [row] = await db
    .select()
    .from(invoiceDocuments)
    .where(
      and(
        eq(invoiceDocuments.orgId, orgId),
        eq(invoiceDocuments.invoiceId, invoiceId),
        eq(invoiceDocuments.kind, kind),
      ),
    )
    .limit(1);
  if (!row) {
    return null;
  }
  const content = await readPrivateFile(row.storageKey);
  if (!content) {
    throw new Error(`Stored ${kind} for invoice ${invoiceId} is missing from storage`);
  }
  if (sha256Hex(content) !== row.sha256) {
    throw new Error(`Stored ${kind} for invoice ${invoiceId} does not match its recorded hash`);
  }
  return { content, contentType: row.contentType, filename: row.filename, sha256: row.sha256 };
}

/** The PDF a download serves: the stored original when there is one, else a live rendering. */
export async function loadInvoicePdf(
  org: InvoiceDocumentOrg,
  invoiceId: string,
  options: { logoSrc?: string | null } = {},
) {
  const stored = await readStoredInvoiceDocument(org.id, invoiceId, "pdf");
  if (stored) {
    return { buffer: new Uint8Array(stored.content), filename: stored.filename, stored: true };
  }
  const rendered = await renderInvoicePdfForOrg(org, invoiceId, options);
  return { buffer: rendered.buffer, filename: rendered.filename, stored: false };
}

/** The XML a download serves: the stored original when there is one, else a validated live rendering. */
export async function loadInvoiceXml(org: InvoiceDocumentOrg, invoiceId: string) {
  const stored = await readStoredInvoiceDocument(org.id, invoiceId, "xrechnung");
  if (stored) {
    return { filename: stored.filename, stored: true, xml: stored.content.toString("utf8") };
  }
  const rendered = await renderXRechnungForOrg(org, invoiceId);
  return { filename: rendered.filename, stored: false, xml: rendered.xml };
}

/** Removes stored files once their invoices are gone (workspace deletion). */
export async function deleteInvoiceDocumentFiles(storageKeys: Array<string>) {
  await deletePrivateFiles(storageKeys);
}
