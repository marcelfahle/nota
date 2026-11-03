import { expect, test } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

import { InvoiceSheet } from "@/components/invoice-sheet";
import type { InvoiceSheetProps } from "@/lib/invoice-sheet";

const props: InvoiceSheetProps = {
  business: {
    address: "Calle Fora Mur, 12\n03700 Dénia\nAlicante\nSpain",
    bic: "TRWIBEB1XXX",
    brandColor: "#1f1b16",
    iban: "BE20905804328956",
    logo: { src: "https://cdn.test/logo.png" },
    name: "No Rules Software SL",
    taxIdentifier: {
      canonicalValue: "ESB72645211",
      countryCode: "ES",
      type: "eu_vat",
      value: "ESB72645211",
    },
  },
  client: {
    address: "Wahlerstrasse 21\n40472 Düsseldorf\nGermany",
    company: " ",
    email: "invoice@ranger.de",
    name: "Ranger Marketing & Vertriebs GmbH",
    taxIdentifier: null,
  },
  invoice: {
    currency: "EUR",
    dueAt: "2026-11-09",
    issuedAt: "2026-11-02",
    kind: "invoice",
    lineItems: [
      {
        amount: "1000.00",
        description: "Video Streaming & Server Betreuung",
        quantity: "1",
        unitPrice: "1000.00",
      },
    ],
    number: "DRAFT-56ed3b96-c6b4-4b41-a3a2-92145469c176",
    servicePeriodEnd: "2026-10-31",
    servicePeriodStart: "2026-10-01",
    subtotal: "1000.00",
    taxAmount: "0.00",
    taxRate: "0",
    taxTreatment: "zero_rated",
    total: "1000.00",
  },
  locale: "en",
};

test("a draft says so instead of printing its identifier, in the document language", () => {
  const html = renderToStaticMarkup(<InvoiceSheet {...props} />);
  expect(html).not.toContain("DRAFT-56ed3b96");
  expect(html).toContain('data-testid="invoice-sheet-number"');
  expect(html).toContain(">Draft<");
  expect(html).toContain("Invoice Draft");
  expect(renderToStaticMarkup(<InvoiceSheet {...props} locale="de" />)).toContain(">Entwurf<");
  expect(
    renderToStaticMarkup(
      <InvoiceSheet {...props} invoice={{ ...props.invoice, number: "0000104" }} />,
    ),
  ).toContain(">0000104<");
});

test("a blank company line is not printed and the logo keeps its aspect ratio", () => {
  const html = renderToStaticMarkup(<InvoiceSheet {...props} />);
  expect(html).toContain("Ranger Marketing &amp; Vertriebs GmbH");
  expect(html).not.toContain("> <");
  expect(html).toContain('src="https://cdn.test/logo.png"');
  expect(html).toContain("object-fit:contain");
  expect(html).toContain("max-width:160px");
  expect(html).toContain("width:auto");
});

test("the sheet carries the same sections as the PDF", () => {
  const html = renderToStaticMarkup(<InvoiceSheet {...props} stamp="Paid" />);
  for (const text of [
    "Bill to",
    "Service period",
    "Oct 1, 2026 – Oct 31, 2026",
    "Payment details",
    "BE20 9058 0432 8956",
    "Thank you for your business.",
    "ESB72645211",
  ]) {
    expect(html).toContain(text);
  }
  expect(html).toContain(">Paid<");
});
