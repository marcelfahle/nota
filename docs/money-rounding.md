# Invoice money and rounding policy

Nota treats API decimal strings as the canonical representation and does not use binary
floating-point arithmetic for persisted invoice values.

## Policy

- Supported invoice currencies have ISO exponents of 0, 2, 3, or 4 decimal places. This includes
  existing API-created documents in four-decimal currencies such as CLF.
- Quantities, unit prices, and tax rates accept up to six decimal places. Quantities must be
  positive, unit prices non-negative, and tax rates between 0 and 100.
- Each line is `quantity × unit price`, rounded half up to the currency exponent. The subtotal is
  the exact sum of those rounded lines. Tax is calculated once from the subtotal and rounded half
  up to the currency exponent. Total is the exact sum of subtotal and tax.
- User-entered payments must already fit the currency exponent; they are rejected rather than
  silently rounded. Payments and issued credit notes reconcile against stored document totals with
  exact decimal arithmetic.
- REST and SDK responses remain decimal strings. EUR/USD/GBP values therefore use two decimals,
  JPY uses none, BHD/KWD-style currencies use three, and CLF uses four.

## Historical documents

Migration `0020_large_pepper_potts.sql` only widens numeric precision and scale. It does not update totals,
line amounts, tax, payments, statuses, external references, or issued document rows. Issued invoice
PDF/XML, credit notes, duplicates, settlement, and API reads use the stored values. Only creating or
editing a draft invokes the policy above; issued invoices remain immutable and are never silently
recalculated.

Persisted values are reconciled at the database's four-decimal precision. Values that conform to a
supported currency are formatted at its ISO exponent. A legacy value that does not conform (for
example, `150.50` JPY) or uses a historical unsupported currency remains readable and is returned
without changing its value, with at least two decimal places and at most four.

Stripe's documented ISK/UGX transport exception remains isolated in `stripe-amount.ts`. Stripe
amounts are rounded half up only at that provider boundary when a legacy stored value cannot be
represented in Stripe's exponent; invoice storage and reconciliation retain the exact stored value.
