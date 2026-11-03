import { expect, test } from "bun:test";

import { render } from "@react-email/components";

import { InvoiceSentEmail } from "@/emails/invoice-sent";

const props = {
  businessName: "Studio Beispiel",
  clientName: "Max Kunde",
  currency: "EUR",
  dueAt: "2026-11-15",
  invoiceNumber: "INV-0007",
  invoiceUrl: "http://localhost:3000/i/token",
  paymentLinkUrl: null,
  total: "119.00",
};

test("the invoice email mentions the XML only when it is attached", async () => {
  const sentence = "attached as a PDF and as XRechnung XML";
  expect(await render(InvoiceSentEmail({ ...props, xmlAttached: true }))).toContain(sentence);
  expect(await render(InvoiceSentEmail(props))).not.toContain(sentence);
  expect(await render(InvoiceSentEmail({ ...props, reminder: true }))).not.toContain(sentence);
});

test("a personal message replaces the stock greeting and thanks, kept verbatim and escaped", async () => {
  const message = "Hallo zusammen,\n\nanbei die Rechnung <b>für Oktober</b>.\nDanke & Gruß";
  const html = await render(InvoiceSentEmail({ ...props, message }));
  expect(html).toContain("anbei die Rechnung &lt;b&gt;für Oktober&lt;/b&gt;.");
  expect(html).toContain("Danke &amp; Gruß");
  expect(html).toContain("white-space:pre-line");
  expect(html).not.toContain("Hi Max Kunde");
  expect(html).not.toContain("Thank you for your business.");
  expect(html).toContain("INV-0007");
  expect(html).toContain("View invoice");
  const stock = await render(InvoiceSentEmail(props));
  expect(stock).toContain("Hi Max Kunde");
  expect(stock).toContain("Thank you for your business.");
});

test("the sender is the brand: their logo heads the email, their colour paints the button, Nota signs off", async () => {
  const html = await render(
    InvoiceSentEmail({
      ...props,
      brandColor: "#d1fd39",
      logo: { height: 24, src: "https://cdn.test/wordmark.png", width: 200 },
    }),
  );
  expect(html).toContain('src="https://cdn.test/wordmark.png"');
  expect(html).toContain('width="200"');
  expect(html).toContain('height="24"');
  expect(html).toContain("background-color:#d1fd39");
  expect(html).toContain("color:#1f1b16");
  expect(html).toContain("Sent with");
  expect(html).toContain("https://withnota.com");
  // Without a logo the business name heads the email, never the app's name.
  const plain = await render(InvoiceSentEmail(props));
  expect(plain).toContain("Studio Beispiel");
  expect(plain).not.toMatch(/>nota</);
});
