import { describe, expect, test } from "bun:test";

import {
  buildInvoiceArchiveFilename,
  buildInvoiceArchiveUrl,
  buildInvoicePdfFilename,
  getUniqueInvoiceArchiveEntryName,
  getPreviousInvoicePeriod,
  resolveInvoicePeriod,
} from "@/lib/invoice-period";

const NOW = new Date("2026-07-20T12:00:00.000Z");

describe("resolveInvoicePeriod", () => {
  test("resolves the previous calendar quarter", () => {
    expect(resolveInvoicePeriod({ period: "last_quarter" }, NOW)).toEqual({
      from: "2026-04-01",
      key: "last_quarter",
      label: "Q2 2026",
      to: "2026-06-30",
    });
  });

  test("resolves this quarter and year to date", () => {
    expect(resolveInvoicePeriod({ period: "this_quarter" }, NOW)).toMatchObject(
      {
        from: "2026-07-01",
        label: "Q3 2026",
        to: "2026-09-30",
      },
    );
    expect(resolveInvoicePeriod({ period: "year_to_date" }, NOW)).toMatchObject(
      {
        from: "2026-01-01",
        label: "2026 year to date",
        to: "2026-07-20",
      },
    );
  });

  test("validates custom date ranges", () => {
    expect(
      resolveInvoicePeriod(
        { from: "2026-05-01", period: "custom", to: "2026-05-31" },
        NOW,
      ),
    ).toMatchObject({
      from: "2026-05-01",
      label: "May 1–31, 2026",
      to: "2026-05-31",
    });

    expect(() =>
      resolveInvoicePeriod(
        { from: "2026-06-01", period: "custom", to: "2026-05-01" },
        NOW,
      ),
    ).toThrow("start date must be on or before the end date");
  });

  test("derives an equally sized previous comparison period", () => {
    const current = resolveInvoicePeriod({ period: "last_quarter" }, NOW);

    expect(getPreviousInvoicePeriod(current)).toMatchObject({
      from: "2026-01-01",
      label: "Jan 1–Mar 31, 2026",
      to: "2026-03-31",
    });
  });
});

describe("invoice archive links", () => {
  test("builds an authenticated relative download URL", () => {
    expect(
      buildInvoiceArchiveUrl({
        clientId: "c8b30d6e-76f0-4d4c-b150-c43ca6d97b9c",
        period: "last_quarter",
        status: "paid",
      }),
    ).toBe(
      "/api/invoices/archive?period=last_quarter&status=paid&client_id=c8b30d6e-76f0-4d4c-b150-c43ca6d97b9c",
    );
  });

  test("creates a descriptive safe archive filename", () => {
    const range = resolveInvoicePeriod({ period: "last_quarter" }, NOW);

    expect(
      buildInvoiceArchiveFilename(range, {
        clientName: "ACME / Europe",
        status: "paid",
      }),
    ).toBe("nota-invoices_2026-Q2_acme-europe_paid.zip");
  });

  test("creates a sortable, recognizable PDF filename", () => {
    expect(
      buildInvoicePdfFilename({
        clientName: "Acme / Europe",
        issuedAt: "2026-04-30",
        number: "INV/0042",
      }),
    ).toBe("2026-04-30_INV-0042_Acme-Europe.pdf");
  });

  test("keeps colliding archive entries instead of overwriting them", () => {
    const usedNames = new Set<string>();
    expect(getUniqueInvoiceArchiveEntryName("invoice.pdf", usedNames)).toBe(
      "invoice.pdf",
    );
    expect(getUniqueInvoiceArchiveEntryName("invoice.pdf", usedNames)).toBe(
      "invoice_2.pdf",
    );
    expect(getUniqueInvoiceArchiveEntryName("invoice.pdf", usedNames)).toBe(
      "invoice_3.pdf",
    );
  });
});
