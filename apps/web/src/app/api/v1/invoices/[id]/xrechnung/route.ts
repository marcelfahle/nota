import { error as apiError, json, requireAuth } from "@/lib/api-response";
import { loadInvoiceXml } from "@/lib/invoice-documents";
import { XRechnungValidationError } from "@/lib/xrechnung";
import { InvoiceDocumentError } from "@/lib/xrechnung-service";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth(request);
  if ("error" in authResult) {
    return authResult.error;
  }

  const { id } = await params;
  try {
    const { filename, xml } = await loadInvoiceXml(authResult.auth.org, id);
    return new Response(xml, {
      headers: {
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": "application/xml",
      },
    });
  } catch (error) {
    if (error instanceof InvoiceDocumentError) {
      return apiError(error.message, error.status);
    }
    if (error instanceof XRechnungValidationError) {
      return json({ error: error.message, problems: error.problems }, 422);
    }
    throw error;
  }
}
