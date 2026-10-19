# Nota API

Nota exposes a small bearer-token API for managing clients and invoices inside a single organization.

## Base URL

Use the app origin for your deployment.

```text
https://your-domain.com/api/v1
```

Examples below use:

```bash
export NOTA_API_BASE_URL="https://your-domain.com/api/v1"
export NOTA_API_KEY="nota_..."
```

## Authentication

All API routes require a bearer token created from the Nota settings UI.

```bash
-H "Authorization: Bearer $NOTA_API_KEY"
```

API keys are scoped to a real user and organization. Requests inherit that user's role.

## Content Types

- JSON routes accept `Content-Type: application/json`
- PDF downloads return `application/pdf`
- XRechnung downloads return `application/xml`

## Payments and billing

`GET /billing` returns the current workspace's plan, monthly send usage and limit, connected account ID, payment/payout readiness, and subscription status under `data`. `limit: null` means unlimited.

Workspace owners can call `POST /billing` with `{ "action": "connect" }`. Supported actions:

| Action          | Result                                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------------------------- |
| `connect`       | `data.url` to connect a new/existing Stripe account or continue onboarding                                 |
| `refresh`       | `data.status` with current Stripe account readiness                                                        |
| `disconnect`    | Revokes Nota's access and returns `data.status`; old payment links remain in the merchant's Stripe account |
| `month`, `year` | `data.url` for Nota Pro checkout at $9/month or $90/year                                                   |
| `portal`        | `data.url` to Stripe's billing portal                                                                      |

Open returned URLs in the owner's browser. Connect callbacks require the same owner signed into the same workspace. Members/admins receive `403` for these mutations. Invalid actions return `400`; unavailable billing actions return `409`.

In hosted mode the sixth new invoice send in a UTC calendar month is rejected on the Free plan through every invoice interface. Retrying a successful send does not consume another send. Cancelling or deleting a sent invoice does not restore usage. The quota applies whether payment is by Stripe or bank transfer. Pro and self-hosted direct mode have unlimited sends.

## Response Format

Successful JSON responses use one of these shapes.

### Object payload

```json
{
  "data": {
    "id": "..."
  }
}
```

### Paginated list

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "perPage": 20,
    "total": 3
  }
}
```

### Error

```json
{
  "error": "Invoice not found"
}
```

## Pagination

List endpoints support:

- `page`: 1-based page number
- `per_page`: items per page, max `100`

## Role Enforcement

API keys inherit the issuing user's org role.

- `member`, `admin`, and `owner` can create invoices, update draft invoices, and duplicate invoices
- `admin` and `owner` can delete draft invoices, send invoices, send reminders, mark invoices paid, and cancel invoices
- client endpoints currently require authentication but do not add stricter role gates beyond org membership

## Create an API Key

There is no public API endpoint for API key creation yet.

Create keys in the web app:

1. Open `Settings`
2. Go to `API Keys`
3. Create a key and copy the revealed token immediately

## Endpoints

### GET /me

Returns the authenticated user, org, and role.

```bash
curl "$NOTA_API_BASE_URL/me" \
  -H "Authorization: Bearer $NOTA_API_KEY"
```

Example response:

```json
{
  "data": {
    "org": {
      "id": "org_uuid",
      "name": "Acme Workspace"
    },
    "role": "owner",
    "user": {
      "email": "owner@example.com",
      "id": "user_uuid",
      "name": "Owner"
    }
  }
}
```

### GET /clients

Lists clients in the authenticated org.

Query params:

- `search`: searches `name`, `company`, and `email`
- `page`
- `per_page`

```bash
curl "$NOTA_API_BASE_URL/clients?search=acme&page=1&per_page=20" \
  -H "Authorization: Bearer $NOTA_API_KEY"
```

### POST /clients

Creates a client.

Request body:

```json
{
  "name": "Acme GmbH",
  "email": "billing@acme.test",
  "company": "Acme GmbH",
  "street": "Main Street 1",
  "postalCode": "10115",
  "city": "Berlin",
  "countryCode": "DE",
  "publicSector": false,
  "defaultBuyerReference": null,
  "defaultCurrency": "EUR",
  "notes": "Preferred customer",
  "taxIdentifier": { "type": "eu_vat", "value": "DE123456789" },
  "bankAccountId": null
}
```

Address fields:

- `street`, `postalCode`, `city`, `countryCode` (ISO 3166-1 alpha-2) are the structured address. German invoices and XRechnung need all four.
- `address` is the legacy free-text address. It is kept as entered and only used when no structured field is set.
- `publicSector: true` marks a German public authority. Every invoice for it needs a Leitweg-ID as `buyerReference`.
- `defaultBuyerReference` is copied onto new invoices for this client as `buyerReference` (a Leitweg-ID or a standing PO number).

```bash
curl "$NOTA_API_BASE_URL/clients" \
  -H "Authorization: Bearer $NOTA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme GmbH",
    "email": "billing@acme.test",
    "defaultCurrency": "EUR"
  }'
```

### POST /clients/import

Preview a UTF-8 client CSV before importing. Maximum 250 KB and 1,000 data rows; supports comma/semicolon/tab separators and common FreshBooks-style column labels. Requires email and a client/company name. Billing address, currency, VAT number, and notes are preserved. Unused columns are reported, and duplicate emails/invalid rows are skipped. Existing records are never updated.

Preview request:

```json
{ "mode": "preview", "csv": "Organization,Email\nRanger GmbH,invoice@ranger.test" }
```

Response `data` includes `rows` with `ready`/`duplicate`/`invalid` status, matched `columns`, `ignoredColumns`, `counts`, and `hash`. Preview performs no writes. After reviewing, submit the same CSV:

```json
{
  "mode": "commit",
  "csv": "Organization,Email\nRanger GmbH,invoice@ranger.test",
  "previewHash": "<hash from the reviewed preview>"
}
```

Commit returns `data.added` and `data.counts`. A changed CSV/client list returns **409** with a refreshed preview; review it before trying again. The import runs atomically within the authenticated workspace and does not create invoices, payment links, or emails. Invoice-history CSV import is not supported yet.

### GET /clients/:id

Returns a single client with invoice summary fields.

### PATCH /clients/:id

Updates a client.

### DELETE /clients/:id

Deletes a client.

Notes:

- returns `409` if invoices still exist for that client

### GET /invoices

Lists invoices in the authenticated org.

Query params:

- `status`: one of `draft`, `sent`, `paid`, `overdue`, `cancelled`
- `client_id`: client UUID filter
- `search`: searches invoice number and client identity fields
- `page`
- `per_page`

```bash
curl "$NOTA_API_BASE_URL/invoices?status=draft&search=2026" \
  -H "Authorization: Bearer $NOTA_API_KEY"
```

### POST /invoices

Creates a draft invoice with line items.

Request body:

```json
{
  "clientId": "client_uuid",
  "currency": "EUR",
  "issuedAt": "2026-03-06",
  "dueAt": "2026-04-05",
  "servicePeriodStart": "2026-02-01",
  "servicePeriodEnd": "2026-02-28",
  "buyerReference": null,
  "notes": "Thanks for your business",
  "internalNotes": "Internal note",
  "taxTreatment": "standard",
  "taxRate": 19,
  "lineItems": [
    {
      "description": "Consulting",
      "quantity": 2,
      "unitPrice": 150
    }
  ]
}
```

```bash
curl "$NOTA_API_BASE_URL/invoices" \
  -H "Authorization: Bearer $NOTA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "client_uuid",
    "currency": "EUR",
    "issuedAt": "2026-03-06",
    "dueAt": "2026-04-05",
    "taxTreatment": "standard",
    "taxRate": 19,
    "lineItems": [
      {
        "description": "Consulting",
        "quantity": 2,
        "unitPrice": 150
      }
    ]
  }'
```

Tax treatment (`taxTreatment`), one per invoice:

- `standard`: VAT at `taxRate` (for example 19 or 7). UNTDID category S.
- `zero_rated`: a genuine 0% supply. Category Z. Not an exemption.
- `exempt_small_business`: Kleinunternehmer, § 19 UStG. Category E. The document carries "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet."
- `reverse_charge`: business customer abroad, § 13b UStG / Art. 196. Category AE. The client needs a VAT ID when it is in the EU.

Rules:

- Every treatment except `standard` needs `taxRate: 0`. Anything else is rejected with `409`.
- When `taxTreatment` is omitted the workspace default applies. `reverseCharge: true` is still accepted and means `taxTreatment: "reverse_charge"`.
- One VAT rate per invoice. Mixed rates need separate invoices.
- `servicePeriodStart` and `servicePeriodEnd` (YYYY-MM-DD) are the date or period of supply. A single day has start equal to end. When omitted, the month all line items name is used, otherwise the issue date. German invoices need this before they can be issued.
- `buyerReference` defaults to the client's `defaultBuyerReference`. Public-sector clients need a Leitweg-ID here. Without a reference, the XRechnung export uses the invoice number as the buyer reference for non-public-sector clients.

Notes:

- invoice numbers are auto-generated from the organization's invoice numbering settings
- response includes the full nested invoice payload
- `issueProblems` on a draft lists what must be fixed before it can be sent (empty when nothing blocks it). See `docs/german-invoices.md` in the repository for the full set of rules.

### GET /invoices/:id

Returns one invoice with:

- `client`
- `lineItems`
- `activityLog`
- `documents`: the originals stored at issuance, one entry per file with `kind` (`pdf` or
  `xrechnung`), `sha256`, `byteSize`, `filename` and `createdAt`. Empty for drafts and for invoices
  issued before originals were kept.
- `issuedSnapshot`: seller, buyer, bank and totals exactly as rendered at issuance; `null` on drafts
  and on older issued invoices.

### PATCH /invoices/:id

Updates a draft invoice.

Notes:

- returns `409` if the invoice is no longer a draft
- request body matches `POST /invoices`
- `taxTreatment`, `servicePeriodStart`/`servicePeriodEnd` and `buyerReference` keep their stored values when omitted; send `buyerReference: null` to clear it

### PATCH /invoices/:id/due-date

Changes only the due date, preserving line items and invoice amounts.

```json
{ "dueAt": "2026-10-08" }
```

Members can update drafts; sent and overdue invoices require admin or owner. Paid and cancelled invoices cannot be changed. Dates must be valid ISO dates and cannot precede the issue date. Returns `403` for insufficient permissions, `404` for an invoice outside the workspace or missing, `409` for a concurrent change, and `400` for invalid input. Success returns `{ "data": <invoice detail> }` and records an activity entry. No email is sent.

### DELETE /invoices/:id

Deletes a draft invoice.

Notes:

- returns `409` if the invoice is not a draft
- response shape:

```json
{
  "success": true
}
```

### POST /invoices/:id/duplicate

Creates a new draft invoice by copying an existing invoice.

Notes:

- any authenticated org member can duplicate an invoice
- response status is `201`

```bash
curl -X POST "$NOTA_API_BASE_URL/invoices/invoice_uuid/duplicate" \
  -H "Authorization: Bearer $NOTA_API_KEY"
```

### POST /invoices/:id/send

Sends a draft invoice.

Effects:

- transitions invoice to `sent`
- creates a Stripe payment link
- queues the invoice email job
- returns the updated invoice

Notes:

- requires `admin` or `owner`
- returns `409` if the invoice is not a draft
- returns `422` with `{ "error": "...", "problems": ["..."] }` when the draft is incomplete; `problems` is the same list as `issueProblems` on the invoice
- may return `500` if Stripe link creation fails

### POST /invoices/:id/remind

Queues and processes a reminder email for a sent or overdue invoice.

Notes:

- requires `admin` or `owner`
- returns `409` if the invoice cannot receive reminders

### POST /invoices/:id/mark-paid

Marks an invoice as paid.

Notes:

- requires `admin` or `owner`
- returns the updated invoice
- returns `409` for cancelled invoices or invalid lifecycle transitions

### POST /invoices/:id/cancel

Cancels a sent or overdue invoice.

Notes:

- requires `admin` or `owner`
- returns the updated invoice
- response may include a `warning` if Stripe payment-link deactivation fails

### GET /invoices/:id/pdf

Downloads the invoice PDF. For an issued invoice this is the original stored at issuance, byte for
byte what the customer received; later changes to the client, the workspace, bank details or the
template do not affect it. A draft is rendered live. Invoices issued before originals were kept
(no `documents` entry on `GET /invoices/:id`) are rendered from the current data.

```bash
curl "$NOTA_API_BASE_URL/invoices/invoice_uuid/pdf" \
  -H "Authorization: Bearer $NOTA_API_KEY" \
  -o invoice.pdf
```

### GET /invoices/:id/xrechnung

Downloads the XRechnung 3.0 (UBL) XML export. For an issued invoice with a stored XML original
(the workspace attached it, or the export validated at issuance) this is that original; otherwise
the XML is rendered live.

```bash
curl "$NOTA_API_BASE_URL/invoices/invoice_uuid/xrechnung" \
  -H "Authorization: Bearer $NOTA_API_KEY" \
  -o invoice.xml
```

Returns `422` with `{ "error": "...", "problems": ["..."] }` when the invoice, the workspace or the client is missing something the XRechnung needs (country codes, seller contact with phone, Leitweg-ID for public-sector buyers, a service period, a bank account with a valid IBAN). No file is produced in that case.

The generator is checked against the official KoSIT validator (XRechnung 3.0.2) for a fixed set of scenarios; see `docs/german-invoices.md`, section "Validation", for what that covers and what it does not. It is format conformance, not legal or tax advice.

## Common Status Codes

- `200`: success
- `201`: resource created
- `400`: invalid JSON body or invalid query parameters
- `401`: missing or invalid bearer token
- `403`: insufficient permissions for the user's role
- `404`: invoice or client not found in the authenticated org
- `409`: lifecycle conflict or invalid state transition
- `500`: unexpected send failure during Stripe-linked invoice sending

## Example Flow

Create a client, create an invoice, send it, then mark it paid.

```bash
client_id=$(curl -s "$NOTA_API_BASE_URL/clients" \
  -H "Authorization: Bearer $NOTA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Example Client",
    "email": "billing@example.test",
    "defaultCurrency": "EUR"
  }' | jq -r '.data.id')

invoice_id=$(curl -s "$NOTA_API_BASE_URL/invoices" \
  -H "Authorization: Bearer $NOTA_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"clientId\": \"$client_id\",
    \"currency\": \"EUR\",
    \"issuedAt\": \"2026-03-06\",
    \"dueAt\": \"2026-04-05\",
    \"taxTreatment\": \"standard\",
    \"taxRate\": 19,
    \"lineItems\": [{
      \"description\": \"Consulting\",
      \"quantity\": 2,
      \"unitPrice\": 150
    }]
  }" | jq -r '.data.id')

curl -X POST "$NOTA_API_BASE_URL/invoices/$invoice_id/send" \
  -H "Authorization: Bearer $NOTA_API_KEY"

curl -X POST "$NOTA_API_BASE_URL/invoices/$invoice_id/mark-paid" \
  -H "Authorization: Bearer $NOTA_API_KEY"
```
