import { renderToBuffer } from "@react-pdf/renderer";
import { and, asc, eq } from "drizzle-orm";

import { InvoicePdf } from "@/components/invoice-pdf";
import { error, requireAuth } from "@/lib/api-response";
import { getPdfLogoSrc } from "@/lib/branding";
import { db } from "@/lib/db";
import { bankAccounts, clients, invoices, lineItems } from "@/lib/db/schema";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth(request);
  if ("error" in authResult) {
    return authResult.error;
  }

  const { id } = await params;
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.orgId, authResult.auth.org.id)))
    .limit(1);

  if (!invoice) {
    return error("Invoice not found", 404);
  }

  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, invoice.clientId), eq(clients.orgId, authResult.auth.org.id)))
    .limit(1);

  if (!client) {
    return error("Client not found", 404);
  }

  const items = await db
    .select()
    .from(lineItems)
    .where(eq(lineItems.invoiceId, id))
    .orderBy(asc(lineItems.sortOrder));

  let ba: { bic: string | null; details: string; iban: string | null } | null = null;
  if (client.bankAccountId) {
    const [found] = await db
      .select({ bic: bankAccounts.bic, details: bankAccounts.details, iban: bankAccounts.iban })
      .from(bankAccounts)
      .where(
        and(
          eq(bankAccounts.id, client.bankAccountId),
          eq(bankAccounts.orgId, authResult.auth.org.id),
        ),
      )
      .limit(1);
    ba = found ?? null;
  }

  if (!ba) {
    const [defaultBa] = await db
      .select({ bic: bankAccounts.bic, details: bankAccounts.details, iban: bankAccounts.iban })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.orgId, authResult.auth.org.id), eq(bankAccounts.isDefault, true)))
      .limit(1);
    ba = defaultBa ?? null;
  }

  const logoSrc = await getPdfLogoSrc(authResult.auth.org.logoUrl);
  const buffer = await renderToBuffer(
    InvoicePdf({
      business: {
        address: authResult.auth.org.businessAddress,
        bankDetails: ba?.details ?? null,
        bic: ba?.bic ?? null,
        iban: ba?.iban ?? null,
        logoSrc,
        name: authResult.auth.org.businessName ?? authResult.auth.org.name,
        vatNumber: authResult.auth.org.vatNumber,
      },
      client: {
        address: client.address,
        company: client.company,
        email: client.email,
        name: client.name,
        vatNumber: client.vatNumber,
      },
      invoice: {
        currency: invoice.currency ?? "EUR",
        dueAt: invoice.dueAt,
        issuedAt: invoice.issuedAt,
        lineItems: items.map((item) => ({
          amount: item.amount,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
        notes: invoice.notes,
        number: invoice.number,
        paymentLinkUrl: invoice.stripePaymentLinkUrl,
        reverseCharge: invoice.reverseCharge,
        subtotal: invoice.subtotal ?? "0.00",
        taxAmount: invoice.taxAmount ?? "0.00",
        taxRate: invoice.taxRate ?? "0.00",
        total: invoice.total ?? "0.00",
      },
    }),
  );

  const safeFilename = invoice.number.replaceAll("/", "-");

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Disposition": `attachment; filename="${safeFilename}.pdf"`,
      "Content-Type": "application/pdf",
    },
  });
}
