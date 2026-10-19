import { getPublicInvoice } from "@/lib/public-invoice";
import { XRechnungValidationError } from "@/lib/xrechnung";
import { InvoiceDocumentError, renderXRechnungForOrg } from "@/lib/xrechnung-service";

// Same token as the PDF route. The XML is offered only while the workspace
// setting is on and the export is complete; like the PDF it is rendered from
// the current data, not frozen at send time (NOTA-57).
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invoice = await getPublicInvoice(token);

  if (!invoice || !invoice.xrechnungAvailable) {
    return Response.json({ error: "Invoice not found" }, { status: 404 });
  }

  try {
    const { filename, xml } = await renderXRechnungForOrg(invoice.organization, invoice.id);
    return new Response(xml, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": "application/xml",
      },
    });
  } catch (error) {
    if (error instanceof InvoiceDocumentError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof XRechnungValidationError) {
      return Response.json({ error: error.message, problems: error.problems }, { status: 422 });
    }
    return Response.json({ error: "Invoice XML could not be created" }, { status: 500 });
  }
}
