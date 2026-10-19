import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { XRechnungValidationError } from "@/lib/xrechnung";
import { InvoiceDocumentError, renderXRechnungForOrg } from "@/lib/xrechnung-service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { org } = await getCurrentUser();

  try {
    const { filename, xml } = await renderXRechnungForOrg(org, id);
    return new Response(xml, {
      headers: {
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": "application/xml",
      },
    });
  } catch (error) {
    if (error instanceof InvoiceDocumentError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof XRechnungValidationError) {
      return NextResponse.json({ error: error.message, problems: error.problems }, { status: 422 });
    }
    throw error;
  }
}
