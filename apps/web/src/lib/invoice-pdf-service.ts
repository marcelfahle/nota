import { renderToBuffer } from "@react-pdf/renderer";
import { and, asc, eq } from "drizzle-orm";

import { InvoicePdf } from "@/components/invoice-pdf";
import { getPdfLogoSrc } from "@/lib/branding";
import { db } from "@/lib/db";
import { bankAccounts, clients, invoices, lineItems } from "@/lib/db/schema";
import { buildInvoicePdfFilename } from "@/lib/invoice-period";

export type InvoicePdfOrg = {
  businessAddress: string | null;
  businessName: string | null;
  id: string;
  logoUrl: string | null;
  name: string;
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
      .where(
        and(
          eq(bankAccounts.id, client.bankAccountId),
          eq(bankAccounts.orgId, org.id),
        ),
      )
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
      .where(
        and(eq(bankAccounts.orgId, org.id), eq(bankAccounts.isDefault, true)),
      )
      .limit(1);
    bankAccount = defaultAccount ?? null;
  }

  const logoSrc =
    options.logoSrc === undefined
      ? await getPdfLogoSrc(org.logoUrl)
      : options.logoSrc;
  const buffer = await renderToBuffer(
    InvoicePdf({
      business: {
        address: org.businessAddress,
        bankDetails: bankAccount?.details ?? null,
        bic: bankAccount?.bic ?? null,
        iban: bankAccount?.iban ?? null,
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

  return {
    buffer: new Uint8Array(buffer),
    clientName: client.name,
    filename: buildInvoicePdfFilename({
      clientName: client.name,
      issuedAt: invoice.issuedAt,
      number: invoice.number,
    }),
    invoiceNumber: invoice.number,
  };
}
