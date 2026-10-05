import { expect, test } from "bun:test";

import { pickBrandColors } from "./colors";
import { extractSignals, findEmail, findTaxIdentifier, findVatNumber } from "./signals";

const STRUCTURED = `<!doctype html><html><head>
<title>Bold — video for courses</title>
<meta property="og:site_name" content="Bold">
<meta name="description" content="Video platform for coaching programs.">
<meta name="theme-color" content="#43C6A6">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" sizes="180x180" href="/apple.png">
<link rel="stylesheet" href="/site.css">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"Bold Video","logo":{"@type":"ImageObject","url":"/logo.png"},"email":"mailto:hello@boldvideo.com"}]}</script>
</head><body>
<a href="/terms">Terms</a> <a href="/about">About</a> <a href="https://other.com/legal">Elsewhere</a>
<footer><a href="mailto:support@boldvideo.com">Email us</a></footer></body></html>`;

test("reads name, logo, icons and email from structured data", () => {
  const signals = extractSignals(STRUCTURED, "https://www.boldvideo.com/");
  expect(signals.name).toEqual({ detail: "your site's structured data", value: "Bold Video" });
  expect(signals.email).toBe("hello@boldvideo.com");
  expect(signals.logos[0]).toBe("https://www.boldvideo.com/logo.png");
  expect(signals.icons[0]).toBe("https://www.boldvideo.com/icon.svg");
  expect(signals.themeColor).toBe("#43C6A6");
  expect(signals.stylesheets).toEqual(["https://www.boldvideo.com/site.css"]);
  expect(signals.legalLinks.map((link) => link.url)).toEqual([
    "https://www.boldvideo.com/about",
    "https://www.boldvideo.com/terms",
  ]);
  // Nothing on the page says who the legal entity is or where it sits.
  expect(signals.legalName).toBeNull();
  expect(signals.address).toBeNull();
  expect(signals.vatNumber).toBeNull();
});

const GERMAN = `<html><head><title>Tischlerei Brandt | Möbel nach Maß</title></head><body>
<nav><a href="/impressum">Impressum</a><a href="/datenschutz">Datenschutz</a><a href="/kontakt">Kontakt</a></nav>
<footer>Tischlerei Brandt GmbH · Hauptstraße 12 · 10827 Berlin · info@tischlerei-brandt.de<br>
USt-IdNr.: DE 123 456 789 · Geschäftsführer: siehe Impressum</footer></body></html>`;

test("reads a German site: Impressum first, VAT ID from the footer", () => {
  const signals = extractSignals(GERMAN, "https://tischlerei-brandt.de/");
  expect(signals.name?.value).toBe("Tischlerei Brandt");
  expect(signals.legalLinks[0]).toEqual({
    label: "Impressum",
    url: "https://tischlerei-brandt.de/impressum",
  });
  expect(signals.vatNumber).toBe("DE123456789");
  expect(signals.email).toBe("info@tischlerei-brandt.de");
});

test("a site with no structured data yields a name from its title and nothing invented", () => {
  const signals = extractSignals(
    "<html><head><title>Marta Ruiz</title></head><body><h1>Illustration</h1></body></html>",
    "https://martaruiz.es/",
  );
  expect(signals.name).toEqual({ detail: "your site's title", value: "Marta Ruiz" });
  expect(signals.email).toBeNull();
  expect(signals.legalName).toBeNull();
  expect(signals.vatNumber).toBeNull();
  expect(signals.address).toBeNull();
  expect(signals.logos).toEqual(["https://martaruiz.es/favicon.ico"]);
});

test("a title that ends in a separator still gives a clean name", () => {
  const signals = extractSignals("<title>posteo.de - </title>", "https://posteo.de/");
  expect(signals.name?.value).toBe("posteo.de");
});

test("VAT IDs are taken only next to a VAT label", () => {
  expect(findVatNumber("VAT: NL805734958B01")).toBe("NL805734958B01");
  expect(findVatNumber("NIF/CIF: ES B12345678")).toBe("ESB12345678");
  expect(findVatNumber("Partita IVA IT00159560366")).toBe("IT00159560366");
  expect(findVatNumber("Order DE123456789 shipped")).toBeNull();
  expect(findVatNumber("VAT is included in all prices.")).toBeNull();
});

test("a synthetic EIN is taken only next to an EIN label", () => {
  expect(findTaxIdentifier("Employer Identification Number: 12 3456789")).toEqual({
    canonicalValue: "123456789",
    countryCode: "US",
    type: "us_ein",
    value: "12-3456789",
  });
  expect(findTaxIdentifier("Reference 12-3456789")).toBeNull();
});

test("non-VIES and malformed discovered identifiers remain safe and neutral", () => {
  expect(findTaxIdentifier("VAT: GB123456789")).toMatchObject({
    type: "tax_id",
    value: "GB123456789",
  });
  const signals = extractSignals(
    '<script type="application/ld+json">{"@type":"Organization","name":"Example","vatID":"-"}</script>',
    "https://example.test/",
  );
  expect(signals.taxIdentifier).toBeNull();
});

test("placeholder and asset emails are ignored", () => {
  expect(findEmail('<a href="mailto:support@yourcompany.com">x</a>', "acme.com")).toBeNull();
  expect(findEmail("logo@2x.png and someone@example.com", "acme.com")).toBeNull();
  expect(findEmail("write to jane@gmail.com or hello@acme.com", "acme.com")).toBe("hello@acme.com");
});

test("brand colours: logo first, then theme colour, neutrals dropped, shades merged", () => {
  const css = `
    :root { --brand-primary: #ff5a1f; --text: #111111; --bg: #ffffff; }
    .button { background-color: #ff5a1f; } .button:hover { background: #ff6a2f; }
    a { color: rgb(20, 80, 200); } .muted { color: #777; } .x { color: rgba(255,0,0,0.1); }
  `;
  expect(pickBrandColors(css).map((color) => color.hex)).toEqual(["#FF5A1F", "#1450C8"]);
  expect(pickBrandColors(css, "#00a86b").at(0)).toEqual({ hex: "#00A86B", text: "#1F1B16" });
  expect(pickBrandColors(css, "#00a86b", ["#3b2bd9"]).at(0)).toEqual({
    hex: "#3B2BD9",
    text: "#FFFFFF",
  });
  expect(pickBrandColors("body { color: #222; background: #fff }")).toEqual([]);
});

test("hostile markup is scanned in linear time", () => {
  const hostile = [
    "<a ".repeat(300_000),
    "<a>".repeat(300_000),
    "<script>".repeat(150_000),
    `${"a".repeat(1_000_000)}@`,
    '<p style="'.repeat(150_000),
    "<".repeat(1_000_000),
    "<title>".repeat(200_000),
  ];
  for (const html of hostile) {
    const started = performance.now();
    extractSignals(html, "https://hostile.example/");
    expect(performance.now() - started).toBeLessThan(1500);
  }
});
