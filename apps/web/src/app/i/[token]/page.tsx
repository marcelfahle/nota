import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicInvoiceView } from "@/components/public-invoice-view";
import { documentLocaleOf, getTranslator } from "@/lib/i18n";
import { getPublicInvoice } from "@/lib/public-invoice";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const invoice = await getPublicInvoice(token);
  const t = getTranslator(
    invoice ? documentLocaleOf(invoice, invoice.organization) : "en",
    "public",
  );
  return { robots: { follow: false, index: false }, title: t("title") };
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
