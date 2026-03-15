import { renderToBuffer } from "@react-pdf/renderer";
import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { InvoicePdf } from "@/components/invoice-pdf";
import { getCurrentUser } from "@/lib/auth";
import { getPdfLogoSrc } from "@/lib/branding";
import { db } from "@/lib/db";
import { bankAccounts, clients, invoices, lineItems } from "@/lib/db/schema";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { org } = await getCurrentUser();

  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.orgId, org.id)))
    .limit(1);

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, invoice.clientId), eq(clients.orgId, org.id)))
    .limit(1);

  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const items = await db
    .select()
    .from(lineItems)
    .where(eq(lineItems.invoiceId, id))
    .orderBy(asc(lineItems.sortOrder));

  let bankDetails: string | null = null;
  if (client.bankAccountId) {
    const [ba] = await db
      .select({ details: bankAccounts.details })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, client.bankAccountId), eq(bankAccounts.orgId, org.id)))
      .limit(1);
    bankDetails = ba?.details ?? null;
  }
  if (!bankDetails) {
    const [defaultBa] = await db
      .select({ details: bankAccounts.details })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.orgId, org.id), eq(bankAccounts.isDefault, true)))
      .limit(1);
    bankDetails = defaultBa?.details ?? null;
  }

  const logoSrc = await getPdfLogoSrc(org.logoUrl);

  const buffer = await renderToBuffer(
    InvoicePdf({
      business: {
        address: org.businessAddress,
        bankDetails,
        logoSrc,
        name: org.businessName ?? org.name,
        vatNumber: org.vatNumber,
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
