import { zipSync } from "fflate";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { getPdfLogoSrc } from "@/lib/branding";
import { invoiceStatusEnum } from "@/lib/db/schema";
import {
  listInvoicesForExport,
  MAX_INVOICE_ARCHIVE_SIZE,
} from "@/lib/invoice-export";
import { normalizeInvoiceStatus } from "@/lib/invoice-lifecycle";
import {
  InvoicePdfDataError,
  renderInvoicePdfForOrg,
} from "@/lib/invoice-pdf-service";
import {
  buildInvoiceArchiveFilename,
  getUniqueInvoiceArchiveEntryName,
  isInvoicePeriodKey,
  resolveInvoicePeriod,
} from "@/lib/invoice-period";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { org } = await getCurrentUser();
  const params = new URL(request.url).searchParams;
  const from = params.get("from");
  const to = params.get("to");
  const periodValue =
    params.get("period") ?? (from || to ? "custom" : "last_quarter");
  if (!isInvoicePeriodKey(periodValue)) {
    return Response.json({ error: "Unknown invoice period" }, { status: 400 });
  }

  const statusValue = params.get("status");
  if (
    statusValue &&
    !invoiceStatusEnum.enumValues.includes(
      statusValue as (typeof invoiceStatusEnum.enumValues)[number],
    )
  ) {
    return Response.json({ error: "Unknown invoice status" }, { status: 400 });
  }

  const clientId = params.get("client_id");
  if (clientId && !z.string().uuid().safeParse(clientId).success) {
    return Response.json({ error: "Invalid client id" }, { status: 400 });
  }

  let period;
  try {
    period = resolveInvoicePeriod({
      from,
      period: periodValue,
      to,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Invalid invoice period",
      },
      { status: 400 },
    );
  }

  try {
    const rows = await listInvoicesForExport(org.id, {
      clientId,
      period,
      status: statusValue ? normalizeInvoiceStatus(statusValue) : null,
    });

    if (rows.length === 0) {
      return Response.json(
        { error: `No invoices found for ${period.label}.` },
        { status: 404 },
      );
    }
    if (rows.length > MAX_INVOICE_ARCHIVE_SIZE) {
      return Response.json(
        {
          error: `This archive has more than ${MAX_INVOICE_ARCHIVE_SIZE} invoices. Choose a shorter period, one client, or a status.`,
        },
        { status: 413 },
      );
    }

    const logoSrc = await getPdfLogoSrc(org.logoUrl);
    const files: Record<string, Uint8Array> = {};
    const usedFilenames = new Set<string>();

    for (let index = 0; index < rows.length; index += 3) {
      const batch = await Promise.all(
        rows
          .slice(index, index + 3)
          .map((row) => renderInvoicePdfForOrg(org, row.id, { logoSrc })),
      );
      for (const pdf of batch) {
        files[getUniqueInvoiceArchiveEntryName(pdf.filename, usedFilenames)] =
          pdf.buffer;
      }
    }

    const archive = zipSync(files, { level: 0 });
    const filename = buildInvoiceArchiveFilename(period, {
      clientName: clientId ? rows[0]?.clientName : null,
      status: statusValue,
    });

    return new Response(archive, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(archive.byteLength),
        "Content-Type": "application/zip",
        "X-Nota-Invoice-Count": String(rows.length),
      },
    });
  } catch (error) {
    if (error instanceof InvoicePdfDataError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    return Response.json(
      { error: "Invoice archive could not be created" },
      { status: 500 },
    );
  }
}
