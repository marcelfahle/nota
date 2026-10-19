import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicInvoiceView } from "@/components/public-invoice-view";
import { db } from "@/lib/db";
import { invoices, orgs } from "@/lib/db/schema";
import { documentLocaleOf, getTranslator } from "@/lib/i18n";
import { getPublicInvoice } from "@/lib/public-invoice";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  // Only the language is needed for the title; the page loads the document itself.
  const [row] = await db
    .select({ invoiceLocale: invoices.documentLocale, orgLocale: orgs.documentLocale })
    .from(invoices)
    .innerJoin(orgs, eq(orgs.id, invoices.orgId))
    .where(eq(invoices.publicToken, token))
    .limit(1);
  const locale = row
    ? documentLocaleOf({ documentLocale: row.invoiceLocale }, { documentLocale: row.orgLocale })
    : "en";
  return {
    robots: { follow: false, index: false },
    title: getTranslator(locale, "public")("title"),
  };
}

export default async function PublicInvoicePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invoice = await getPublicInvoice(token, true);

  if (!invoice) {
    notFound();
  }

  return <PublicInvoiceView invoice={invoice} token={token} />;
}
