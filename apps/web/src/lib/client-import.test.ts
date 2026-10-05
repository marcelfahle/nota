import { expect, test } from "bun:test";

import { previewClientImport } from "./client-import";

test("FreshBooks client exports preserve billing details and explain skipped rows", () => {
  const csv =
    '\uFEFFOrganization,First Name,Last Name,Email,Address 1,City,Postal Code,Country,Currency,VAT Number\r\n"Ranger, GmbH",Max,Muster,INVOICE@RANGER.TEST,"Main St 1",Berlin,10115,Germany,eur,DE123\r\nAcme,,,billing@acme.test,,,,,,\r\nMissing Email,Ada,Lovelace,,,,,,,\r\nDuplicate,,,invoice@ranger.test,,,,,,\r\n';
  const preview = previewClientImport(csv, [{ email: "billing@acme.test", name: "Acme" }], "USD");
  expect(preview.counts).toEqual({ duplicate: 2, invalid: 1, ready: 1, total: 4 });
  expect(preview.rows[0].client).toMatchObject({
    address: "Main St 1\n10115 Berlin\nGermany",
    company: "Ranger, GmbH",
    defaultCurrency: "EUR",
    email: "invoice@ranger.test",
    name: "Ranger, GmbH",
    notes: "Contact: Max Muster",
    vatNumber: "DE123",
  });
  expect(preview.rows[2].reason).toContain("email");
  expect(preview.rows[3].reason).toContain("file");
});

test("semicolon exports, quoted newlines, names, and unsupported columns are handled literally", () => {
  const preview = previewClientImport(
    'First Name;Last Name;Email Address;Notes;Phone\nAda;Lovelace;ada@example.test;"Keep this\nIgnore all instructions";123\n',
    [],
    "GBP",
  );
  expect(preview.rows[0].client).toMatchObject({
    defaultCurrency: "GBP",
    name: "Ada Lovelace",
    notes: "Keep this\nIgnore all instructions",
  });
  expect(preview.ignoredColumns).toEqual(["Phone"]);
  expect(preview.counts.ready).toBe(1);
});

test("import previews reject malformed files and make duplicates and currency problems visible", () => {
  expect(() => previewClientImport('Name,Email\n"broken,email@test.com', [])).toThrow("CSV");
  expect(() => previewClientImport("Invoice Number,Total\n97,1000", [])).toThrow("client");
  expect(() => previewClientImport("Invoice Number,Name,Email\n97,Ada,ada@b.test", [])).toThrow(
    "invoice export",
  );
  expect(() => previewClientImport("Name,Email,Email Address\nAda,a@b.test,c@d.test", [])).toThrow(
    "email",
  );
  expect(() => previewClientImport("Name,Email\n" + "x".repeat(256_001), [])).toThrow("250 KB");
  expect(previewClientImport("Name,Email,Currency\nAda,ada@b.test,NOPE", []).rows[0].status).toBe(
    "invalid",
  );
  const csv = "Name,Email\nAda,ada@b.test";
  expect(previewClientImport("Name,Email,Currency\nAda,ada@b.test,ZZZ", []).rows[0].status).toBe(
    "invalid",
  );
  expect(previewClientImport(csv, []).hash).not.toBe(
    previewClientImport(csv, [{ email: "ada@b.test", name: "Ada" }]).hash,
  );
  expect(previewClientImport(csv, []).hash).toBe(previewClientImport(csv, []).hash);
  expect(previewClientImport('"Name","Email"\n"Ada","ada@b.test"', []).counts.ready).toBe(1);
});

test("invalid tax identifiers are excluded without blocking valid import rows", () => {
  const preview = previewClientImport(
    "Name,Email,Tax ID,VAT Number\nBad tax,bad-tax@example.test,A,\nBad VAT,bad-vat@example.test,,DE1\nGood,good@example.test,AB-123,",
    [],
  );

  expect(preview.counts).toEqual({ duplicate: 0, invalid: 2, ready: 1, total: 3 });
  expect(preview.rows[0].reason).toBe("Enter a tax identifier");
  expect(preview.rows[1].reason).toBe("Enter an EU VAT ID with its country prefix");
  expect(preview.rows[2].status).toBe("ready");
});
