import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { bankAccounts, clients, invoices, lineItems } from "@/lib/db/schema";
import { generateXRechnung } from "@/lib/xrechnung";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { org, user } = await getCurrentUser();

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

  const xml = generateXRechnung({
    business: {
      address: org.businessAddress,
      bankDetails,
      email: user.email,
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
  });

  const safeFilename = invoice.number.replaceAll("/", "-");

  return new Response(xml, {
    headers: {
      "Content-Disposition": `attachment; filename="${safeFilename}.xml"`,
      "Content-Type": "application/xml",
    },
  });
}
