import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicInvoiceView } from "@/components/public-invoice-view";
import { getPublicInvoice } from "@/lib/public-invoice";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Invoice — Nota",
};

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
