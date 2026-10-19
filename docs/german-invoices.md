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
   exemption reason. A Steuernummer is enough; no VAT ID is needed on either side. In the XML the
   Steuernummer is both the tax registration (BT-32) and the seller identifier (BT-29), which
   BR-CO-26 demands when there is no VAT ID.
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

- Reverse charge to a client in the seller's own country, or to an EU client without a VAT ID.
- Missing seller name, structured address, country, or tax identifier (Nr. 1 and 2).
- Missing seller contact name, email or phone with at least three digits (XRechnung BR-DE-5,
  BR-DE-6 and BR-DE-27; the same invoice may have to become an XRechnung).
- Missing client name or structured address with country (Nr. 1).
- Missing service date or period (Nr. 6).
- `standard` with a 0% rate: say which exemption applies instead (Nr. 8).

At XRechnung export, for every workspace, in addition:

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
  BR-DE-16 (seller VAT ID or tax number), plus EN 16931 categories S, Z, E, AE and their
  exemption reasons.

## Delivery: what the customer receives

A workspace setting, `eInvoiceDelivery`, decides what the invoice email carries:

| Value               | Email attachments                                   | Default for             |
| ------------------- | --------------------------------------------------- | ----------------------- |
| `pdf_and_xrechnung` | The PDF and the XRechnung XML, same base name       | Workspaces in DE        |
| `pdf_only`          | The PDF                                             | Everyone else           |

The switch lives in Settings → Email ("Attach the XRechnung XML to invoice emails"). The
migration gave every existing German workspace `pdf_and_xrechnung`; a workspace whose country
is confirmed as Germany during first run gets it too. Changing the country later in Settings does
not flip the switch, so a choice is never overwritten.

When the XML is attached:

- Sending runs the XRechnung export rules (`validateForSending`) inside the issuance transaction,
  before a number is allocated or an email job is queued. An incomplete document is refused with
  the usual `422 { error, problems[] }` on REST, SDK, MCP and CLI, and the same list on the invoice
  page and in chat. The draft's "Before this can be sent, fix" box shows the same list. For a
  German workspace the export rules are already the issuance rules, so nothing new is asked; a
  workspace elsewhere that turns the switch on is held to the same rules before it can send.
- The list of attachments is written into the email job's payload and into the invoice's `sent`
  activity entry (`metadata.attachments: ["pdf", "xml"]`). The history on the invoice page reads
  "Sent with PDF and XRechnung XML". A settings change after the send does not alter either.
- Both files come from the shared invoice document loader (`loadInvoiceDocument`), so the PDF and
  the XML always describe the same invoice. The email says in one sentence that the XML is attached.
- The public invoice page offers "Download XRechnung XML" next to the PDF, under the same token,
  when the setting is on and the export has no problems.

What does not carry the XML:

- Reminders. They carry no attachments at all today and link to the public page, where the XML
  can be downloaded. Attaching it again would resend a file the customer already has.
- Test copies during first run. They may describe a draft that is still incomplete and go to the
  sender only.
- "Mark sent". Nothing leaves Nota, so only the issuance rules apply and the entry stays
  "Invoice sent".

If the XML cannot be rendered when the job runs (the data was complete at send time, so this takes
a settings edit in between), the job fails and retries like any other email failure; it never sends
the PDF alone. Frozen originals of what was sent are the next task (NOTA-57).

All six fixtures (ordinary B2B, Kleinunternehmer, reverse charge, credit note, public sector,
zero-rated) pass the official KoSIT validator 1.6.3 with the XRechnung 3.0.2 configuration of
2026-08-31 with no errors or warnings. Wiring that validator into the repo is the next task
(NOTA-55). The XML
is built by one function, `generateXRechnung` in `apps/web/src/lib/xrechnung.ts`, so it can be
validated there without touching the rest.
