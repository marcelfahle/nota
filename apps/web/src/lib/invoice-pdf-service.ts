import { renderToBuffer } from "@react-pdf/renderer";
import { and, asc, eq } from "drizzle-orm";

import { InvoicePdf } from "@/components/invoice-pdf";
import { formatOrgAddress, getPdfLogoSrc } from "@/lib/branding";
import { db } from "@/lib/db";
import { bankAccounts, clients, invoices, lineItems } from "@/lib/db/schema";
import { buildInvoiceFilename } from "@/lib/invoice-filename";

export type InvoicePdfOrg = {
  brandColor: string | null;
  businessAddress: string | null;
  businessName: string | null;
  city: string | null;
  country: string | null;
  id: string;
  legalName: string | null;
  logoUrl: string | null;
  name: string;
  postalCode: string | null;
  region: string | null;
  street: string | null;
  vatNumber: string | null;
};

export class InvoicePdfDataError extends Error {
  readonly status = 404;

  constructor(message: string) {
    super(message);
    this.name = "InvoicePdfDataError";
  }
}

export async function renderInvoicePdfForOrg(
  org: InvoicePdfOrg,
  invoiceId: string,
  options: { logoSrc?: string | null } = {},
) {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.orgId, org.id)))
    .limit(1);

  if (!invoice) {
    throw new InvoicePdfDataError("Invoice not found");
  }

  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, invoice.clientId), eq(clients.orgId, org.id)))
    .limit(1);

  if (!client) {
    throw new InvoicePdfDataError("Client not found");
  }

  const items = await db
    .select()
    .from(lineItems)
    .where(eq(lineItems.invoiceId, invoiceId))
    .orderBy(asc(lineItems.sortOrder));
  const [creditedInvoice] = invoice.creditsInvoiceId
    ? await db
        .select({ number: invoices.number })
        .from(invoices)
        .where(eq(invoices.id, invoice.creditsInvoiceId))
        .limit(1)
    : [];

  let bankAccount: {
    bic: string | null;
    details: string;
    iban: string | null;
  } | null = null;
  if (client.bankAccountId) {
    const [assignedAccount] = await db
      .select({
        bic: bankAccounts.bic,
        details: bankAccounts.details,
        iban: bankAccounts.iban,
      })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, client.bankAccountId), eq(bankAccounts.orgId, org.id)))
      .limit(1);
    bankAccount = assignedAccount ?? null;
  }

  if (!bankAccount) {
    const [defaultAccount] = await db
      .select({
        bic: bankAccounts.bic,
        details: bankAccounts.details,
        iban: bankAccounts.iban,
      })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.orgId, org.id), eq(bankAccounts.isDefault, true)))
      .limit(1);
    bankAccount = defaultAccount ?? null;
  }

  const logoSrc =
    options.logoSrc === undefined ? await getPdfLogoSrc(org.logoUrl) : options.logoSrc;
  const buffer = await renderToBuffer(
    InvoicePdf({
      business: {
        address: formatOrgAddress(org),
        bankDetails: bankAccount?.details ?? null,
        bic: bankAccount?.bic ?? null,
        brandColor: org.brandColor,
        iban: bankAccount?.iban ?? null,
        logoSrc,
        name: org.legalName ?? org.businessName ?? org.name,
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
    }),
  );

  return {
    buffer: new Uint8Array(buffer),
    clientName: client.name,
    filename: buildInvoiceFilename(
      {
        clientName: client.name,
        issuedAt: invoice.issuedAt,
        lineItems: items,
        number: invoice.number,
      },
      "pdf",
    ),
    invoiceNumber: invoice.number,
  };
}
