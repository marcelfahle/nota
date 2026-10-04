import { getPublicInvoice } from "@/lib/public-invoice";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invoice = await getPublicInvoice(token, true);
  if (!invoice) {
    return Response.json({ error: "Invoice not found" }, { status: 404 });
  }
  return Response.json(
    {
      data: {
        balance: invoice.balance,
        client: {
          defaultCurrency: invoice.client.defaultCurrency,
          email: invoice.client.email,
          id: invoice.client.id,
          name: invoice.client.name,
        },
        creditedAmount: invoice.creditedAmount,
        currency: invoice.currency,
        dueAt: invoice.dueAt,
        issuedAt: invoice.issuedAt,
        kind: invoice.kind,
        lastViewedAt: invoice.lastViewedAt,
        lineItems: invoice.lineItems,
        notes: invoice.notes,
        number: invoice.number,
        paidAmount: invoice.paidAmount,
        settlementStatus: invoice.settlementStatus,
        status: invoice.status,
        total: invoice.total,
        viewCount: invoice.viewCount,
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
