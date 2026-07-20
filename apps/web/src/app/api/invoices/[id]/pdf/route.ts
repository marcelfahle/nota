import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import {
  InvoicePdfDataError,
  renderInvoicePdfForOrg,
} from "@/lib/invoice-pdf-service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { org } = await getCurrentUser();

  try {
    const pdf = await renderInvoicePdfForOrg(org, id);
    return new Response(pdf.buffer, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${pdf.filename}"`,
        "Content-Type": "application/pdf",
      },
    });
  } catch (error) {
    if (error instanceof InvoicePdfDataError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { error: "Invoice PDF could not be created" },
      { status: 500 },
    );
  }
}
