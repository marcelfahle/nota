# German invoices: what Nota supports

Nota models the fields a German freelancer or small service business needs on an
invoice, and refuses to issue or export a document that would look compliant but
is not. This note lists the supported cases, what is rejected, and where the rules
come from. Validation lives in one place, `apps/web/src/lib/invoice-compliance.ts`,
and every surface (web, chat, REST, SDK, MCP, CLI) shows the same problems.

## The model

| Field                                   | Where            | Purpose                                                                 |
| --------------------------------------- | ---------------- | ----------------------------------------------------------------------- |
| `taxTreatment`                          | invoice          | `standard`, `zero_rated`, `exempt_small_business`, `reverse_charge`     |
| `taxRate`                               | invoice          | The one VAT rate of the invoice. Must be 0 for every non-standard treatment |
| `servicePeriodStart`, `servicePeriodEnd`| invoice          | Leistungsdatum or Leistungszeitraum. Start equals end for a single day  |
| `buyerReference`                        | invoice          | BT-10. Leitweg-ID for public-sector buyers, or a reference the buyer asked for |
| `defaultTaxTreatment`                   | workspace (org)  | What new invoices start with. "Kleinunternehmer" is `exempt_small_business` |
| `countryCode`, `street`, `postalCode`, `city` | org, client | Structured address. The old free-text fields stay as entered          |
| `contactName`, `contactEmail`, `contactPhone` | org        | Seller contact for XRechnung (BR-DE-2, BR-DE-5 to 7)                    |
| `publicSector`, `defaultBuyerReference` | client           | Marks a Behörde and stores its Leitweg-ID                               |
| tax identifier                          | org, client      | VAT ID (`eu_vat`) or Steuernummer (`tax_id`), from NOTA-63             |

## Supported scenarios

1. **Ordinary German B2B or B2C invoice.** `standard` with 19% or 7%. Category S in the XRechnung.
2. **Kleinunternehmer (§ 19 UStG).** `exempt_small_business`, 0%. The invoice prints
   "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet." Category E with that text as the
   exemption reason. A Steuernummer is enough; no VAT ID is needed on either side.
3. **Reverse charge to a business customer abroad (§ 13b UStG, Art. 196 VAT Directive).**
   `reverse_charge`, 0%. The invoice prints "Steuerschuldnerschaft des Leistungsempfängers".
   Category AE with `VATEX-EU-AE`. The client must be outside Germany; inside the EU it must
   have a VAT ID.
4. **Genuine zero-rated supply.** `zero_rated`, 0%, category Z. For cases where the rate really
   is 0% (for example an intra-community supply of goods). It is not a stand-in for an exemption.
5. **Credit note.** Mirrors the original invoice's treatment, period and buyer reference, carries
   a reference to the original number, and exports as a UBL CreditNote (type 381).
6. **Public-sector recipient.** A client marked `publicSector` must carry its Leitweg-ID as the
   buyer reference on every invoice. The XRechnung uses it as BT-10.

## What is rejected, and when

Drafts may be incomplete. Issuing (send or mark sent) and the XRechnung export are not.

Always, even on save:

- A non-standard treatment with a tax rate above 0. The totals would be wrong.
- A service period that ends before it starts, or has only one of the two dates.

At issuance, for every workspace:

- A public-sector client without a buyer reference.

At issuance, for German workspaces (`countryCode` DE), following § 14 Abs. 4 UStG:

- A bank account whose IBAN fails the ISO 13616 check (mod 97). A missing IBAN is allowed here.
- Reverse charge to a client in the seller's own country, or to an EU client without a VAT ID.
- Missing seller name, structured address, country, or tax identifier (Nr. 1 and 2).
- Missing seller contact name or email (needed for the XRechnung the same invoice may become).
- Missing client name or structured address with country (Nr. 1).
- Missing service date or period (Nr. 6).
- `standard` with a 0% rate: say which exemption applies instead (Nr. 8).

At XRechnung export, for every workspace, in addition:

- Missing seller phone (BR-DE-6).
- No bank account with an IBAN, or an IBAN that fails the check. The XML announces a SEPA credit
  transfer (payment means 58), so the validator demands an account (BR-61, BR-DE-23) and warns on
  a wrong IBAN (BR-DE-19). The IBAN is read as the export reads it: the structured field first,
  else the first IBAN in the free-text bank details.
- Any of the German issuance rules above, because XRechnung 3.0 is a German standard.

Mixed VAT rates on one invoice are not supported. One rate per document; split the work into
separate invoices. The form, the API docs and the chat tool say so.

Nota does not check whether a workspace really qualifies as Kleinunternehmer or whether a
specific service falls under § 13b. It records what the user declares and prints the matching
note.

## Legacy data

The migration keeps every historical value and only interprets the old flags:

- `reverseCharge = true` becomes `reverse_charge`.
- A stated 0% rate without the flag becomes `zero_rated`, because that is what the document said.
  A Kleinunternehmer exemption is never inferred; set the workspace default and edit drafts.
- Everything else, including a rate that was never entered, is `standard`.
- Free-text addresses of the form "Street, 12345 City, Country" (or on three lines) are split
  once into structured fields. The free text is kept. Anything else stays free text until the
  client is edited, and a German workspace sees "Split the client's address" before issuing.
- The workspace country code is read from the country name once when it is unambiguous
  ("UK" becomes GB; unknown two-letter text is left empty). At runtime a workspace without a
  stored code still counts as German when its country name says so.
- The seller contact defaults to the first workspace owner's name and email.
- An already issued invoice without a service period can still be exported as XRechnung; the
  period is simply absent, because issued documents cannot be edited.

Issued invoices are never renumbered, recalculated or rewritten.

## Sources

- § 14 Abs. 4 UStG, mandatory invoice content: name and address of both parties, tax number or
  VAT ID, date, sequential number, description and quantity, date or period of supply, net
  amount per rate, rate and tax amount or a note on the exemption.
- § 19 UStG, Kleinunternehmer: no VAT is charged; the invoice must say so.
- § 13b UStG and Art. 196 Directive 2006/112/EC, reverse charge: the recipient owes the VAT; the
  invoice must state "Steuerschuldnerschaft des Leistungsempfängers" (§ 14a Abs. 5 UStG).
- XRechnung 3.0 (KoSIT) business rules: BR-DE-2 (seller contact), BR-DE-5/6/7 (contact name,
  phone, email), BR-DE-9 (seller postal code), BR-DE-15 (buyer reference BT-10 mandatory),
  BR-DE-16 (seller VAT ID or tax number), BR-DE-19/23 and BR-61 (SEPA transfer needs an account
  with a correct IBAN), plus EN 16931 categories S, Z, E, AE and their exemption reasons.
- EN 16931 BR-CO-26: the seller needs an identifier (BT-29), a legal registration ID (BT-30) or a
  VAT ID (BT-31). A Steuernummer is BT-32 and does not count, so a seller without a VAT ID gets
  its Steuernummer repeated as BT-29.

## Validation

Every XRechnung Nota can produce is checked against the official KoSIT validator, in CI on every
pull request and on demand locally. The XML is built by one function, `generateXRechnung` in
`apps/web/src/lib/xrechnung.ts`, and the check runs that function on fixed inputs, so what passes
is exactly what the app exports.

What runs:

- KoSIT validator 1.6.3 (`itplr-kosit/validator`, `validator-1.6.3-standalone.jar`).
- XRechnung 3.0.2 validator configuration, release 2026-08-31
  (`itplr-kosit/validator-configuration-xrechnung`), which carries the UBL 2.1 schemas, the
  EN 16931 Schematron rules 1.3.16 and the XRechnung 3.0.2 Schematron rules 2.6.0.
- Both downloads are pinned by version and SHA-256 in `apps/web/scripts/validate-xrechnung.ts`
  and cached in `apps/web/.cache/kosit/` (ignored by git).

The fixtures live in `apps/web/src/lib/xrechnung.fixtures.ts` and are the same ones the unit
tests use:

| Fixture                    | Scenario                                                       |
| -------------------------- | -------------------------------------------------------------- |
| `german-b2b-19`            | Ordinary German B2B invoice at 19%, service period, VAT IDs    |
| `kleinunternehmer`         | § 19 UStG, 0%, Steuernummer only, no client VAT ID             |
| `reverse-charge-eu`        | Reverse charge to a French business, category AE               |
| `credit-note`              | UBL CreditNote (381) referring to the original invoice          |
| `public-sector-leitweg-id` | Behörde as buyer with its Leitweg-ID as BT-10                  |
| `multi-month-period-7`     | Two lines at 7%, fractional quantity, period July to September |

The run fails on any rejected document, any document that matches no scenario, or a missing
report. Warnings are printed but do not fail the run; the fixtures produce none. BR-DE-19 is the
warning to expect with a made-up IBAN, which is why the fixtures use a valid one.

Run it locally (Java 17 and `unzip` needed; the first run downloads about 12 MB):

```sh
bun run validate:xrechnung
```

Reports land in `apps/web/.cache/kosit/out/<fixture>-report.xml`.

What this does and does not say: the validator checks that the XML conforms to the XRechnung 3.0.2
format and its business rules for these scenarios. It does not check that the invoice is correct
for a given business, that a workspace really qualifies as Kleinunternehmer, that a supply really
falls under § 13b, or anything about bookkeeping and retention. Nota makes no "GoBD-konform" or
"rechtssicher" claim, and this document is not legal or tax advice. Invoices with data outside the
fixture scenarios (other currencies, mixed rates, unusual tax identifiers) are not covered by the
run and may still be rejected by a recipient's validator.
