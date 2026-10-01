import { error as apiError, requireAuth } from "@/lib/api-response";
import { InvoicePdfDataError, renderInvoicePdfForOrg } from "@/lib/invoice-pdf-service";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth(request);
  if ("error" in authResult) {
    return authResult.error;
  }
  const { id } = await params;
  try {
    const pdf = await renderInvoicePdfForOrg(authResult.auth.org, id);
    return new Response(pdf.buffer, {
      headers: {
        "Content-Disposition": `attachment; filename="${pdf.filename}"`,
        "Content-Type": "application/pdf",
      },
    });
  } catch (error) {
    if (error instanceof InvoicePdfDataError) {
      return apiError(error.message, error.status);
    }
    throw error;
  }
}
