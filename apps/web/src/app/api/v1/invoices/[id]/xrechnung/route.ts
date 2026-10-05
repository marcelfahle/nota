import { and, asc, eq } from "drizzle-orm";

import { error as apiError, requireAuth } from "@/lib/api-response";
import { formatOrgAddress } from "@/lib/branding";
import { db } from "@/lib/db";
import { bankAccounts, clients, invoices, lineItems } from "@/lib/db/schema";
import { buildInvoiceFilename } from "@/lib/invoice-filename";
import { invoiceTaxIdentifier } from "@/lib/tax-identifier";
import { generateXRechnung, XRechnungValidationError } from "@/lib/xrechnung";

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
    return apiError("Invoice not found", 404);
  }

  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, invoice.clientId), eq(clients.orgId, orgId)))
    .limit(1);

  if (!client) {
    return apiError("Client not found", 404);
  }

  const items = await db
    .select()
    .from(lineItems)
    .where(eq(lineItems.invoiceId, id))
    .orderBy(asc(lineItems.sortOrder));
  const [creditedInvoice] = invoice.creditsInvoiceId
    ? await db
        .select({ number: invoices.number })
        .from(invoices)
        .where(eq(invoices.id, invoice.creditsInvoiceId))
        .limit(1)
    : [];

  let bankAccount: { bic: string | null; details: string; iban: string | null } | null = null;
  if (client.bankAccountId) {
    const [ba] = await db
      .select({ bic: bankAccounts.bic, details: bankAccounts.details, iban: bankAccounts.iban })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, client.bankAccountId), eq(bankAccounts.orgId, orgId)))
      .limit(1);
    bankAccount = ba ?? null;
  }
  if (!bankAccount) {
    const [defaultBa] = await db
      .select({ bic: bankAccounts.bic, details: bankAccounts.details, iban: bankAccounts.iban })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.orgId, orgId), eq(bankAccounts.isDefault, true)))
      .limit(1);
    bankAccount = defaultBa ?? null;
  }

  let xml;
  try {
    xml = generateXRechnung({
      business: {
        address: formatOrgAddress(authResult.auth.org),
        bankDetails: bankAccount?.details ?? null,
        bic: bankAccount?.bic ?? null,
        email: authResult.auth.user.email,
        iban: bankAccount?.iban ?? null,
        name: authResult.auth.org.businessName ?? authResult.auth.org.name,
        taxIdentifier: invoiceTaxIdentifier(
          invoice.status,
          invoice.sellerTaxIdentifier,
          authResult.auth.org,
        ),
      },
      client: {
        address: client.address,
        company: client.company,
        email: client.email,
        name: client.name,
        taxIdentifier: invoiceTaxIdentifier(invoice.status, invoice.clientTaxIdentifier, client),
      },
      invoice: {
        currency: invoice.currency ?? "EUR",
        dueAt: invoice.dueAt,
        issuedAt: invoice.issuedAt,
        kind: invoice.kind,
        lineItems: items.map((item) => ({
          amount: item.amount,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
        notes: invoice.notes,
        number: invoice.number,
        originalNumber: creditedInvoice?.number,
        paymentLinkUrl: invoice.stripePaymentLinkUrl,
        reverseCharge: invoice.reverseCharge,
        subtotal: invoice.subtotal ?? "0.00",
        taxAmount: invoice.taxAmount ?? "0.00",
        taxRate: invoice.taxRate ?? "0.00",
        total: invoice.total ?? "0.00",
      },
    });
  } catch (error) {
    if (error instanceof XRechnungValidationError) {
      return apiError(error.message, 422);
    }
    throw error;
  }

  const filename = buildInvoiceFilename(
    {
      clientName: client.name,
      issuedAt: invoice.issuedAt,
      lineItems: items,
      number: invoice.number,
    },
    "xml",
  );

  return new Response(xml, {
    headers: {
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "application/xml",
    },
  });
}
