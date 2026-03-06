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
  "address": "Main Street 1\nBerlin",
  "defaultCurrency": "EUR",
  "notes": "Preferred customer",
  "vatNumber": "DE123456789",
  "bankAccountId": null
}
```

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
  "notes": "Thanks for your business",
  "internalNotes": "Internal note",
  "reverseCharge": false,
  "taxRate": 21,
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
    "taxRate": 21,
    "reverseCharge": false,
    "lineItems": [
      {
        "description": "Consulting",
        "quantity": 2,
        "unitPrice": 150
      }
    ]
  }'
```

Notes:

- invoice numbers are auto-generated from the organization's invoice numbering settings
- response includes the full nested invoice payload

### GET /invoices/:id

Returns one invoice with:

- `client`
- `lineItems`
- `activityLog`

### PATCH /invoices/:id

Updates a draft invoice.

Notes:

- returns `409` if the invoice is no longer a draft
- request body matches `POST /invoices`

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

Downloads the invoice PDF.

```bash
curl "$NOTA_API_BASE_URL/invoices/invoice_uuid/pdf" \
  -H "Authorization: Bearer $NOTA_API_KEY" \
  -o invoice.pdf
```

### GET /invoices/:id/xrechnung

Downloads the XRechnung XML export.

```bash
curl "$NOTA_API_BASE_URL/invoices/invoice_uuid/xrechnung" \
  -H "Authorization: Bearer $NOTA_API_KEY" \
  -o invoice.xml
```

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
    \"taxRate\": 21,
    \"reverseCharge\": false,
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
