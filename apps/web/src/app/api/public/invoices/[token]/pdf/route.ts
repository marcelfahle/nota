import { InvoicePdfDataError, renderInvoicePdfForOrg } from "@/lib/invoice-pdf-service";
import { getPublicInvoice } from "@/lib/public-invoice";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invoice = await getPublicInvoice(token);

  if (!invoice) {
    return Response.json({ error: "Invoice not found" }, { status: 404 });
  }

  try {
    const pdf = await renderInvoicePdfForOrg(invoice.organization, invoice.id);
    return new Response(pdf.buffer, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${pdf.filename}"`,
        "Content-Type": "application/pdf",
      },
    });
  } catch (error) {
    if (error instanceof InvoicePdfDataError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    return Response.json({ error: "Invoice PDF could not be created" }, { status: 500 });
  }
}
