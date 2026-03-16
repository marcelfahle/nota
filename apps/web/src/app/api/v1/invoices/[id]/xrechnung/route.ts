import { and, asc, eq } from "drizzle-orm";

import { error, requireAuth } from "@/lib/api-response";
import { db } from "@/lib/db";
import { bankAccounts, clients, invoices, lineItems } from "@/lib/db/schema";
import { generateXRechnung } from "@/lib/xrechnung";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth(request);
  if ("error" in authResult) {
    return authResult.error;
  }

  const { id } = await params;
  const orgId = authResult.auth.org.id;

  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.orgId, orgId)))
    .limit(1);

  if (!invoice) {
    return error("Invoice not found", 404);
  }

  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, invoice.clientId), eq(clients.orgId, orgId)))
    .limit(1);

  if (!client) {
    return error("Client not found", 404);
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
      .where(and(eq(bankAccounts.id, client.bankAccountId), eq(bankAccounts.orgId, orgId)))
      .limit(1);
    bankDetails = ba?.details ?? null;
  }
  if (!bankDetails) {
    const [defaultBa] = await db
      .select({ details: bankAccounts.details })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.orgId, orgId), eq(bankAccounts.isDefault, true)))
      .limit(1);
    bankDetails = defaultBa?.details ?? null;
  }

  const xml = generateXRechnung({
    business: {
      address: authResult.auth.org.businessAddress,
      bankDetails,
      email: authResult.auth.user.email,
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
  });

  const safeFilename = invoice.number.replaceAll("/", "-");

  return new Response(xml, {
    headers: {
      "Content-Disposition": `attachment; filename="${safeFilename}.xml"`,
      "Content-Type": "application/xml",
    },
  });
}
