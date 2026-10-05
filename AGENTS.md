# Nota engineering invariants

## Invoice numbering

- An invoice number is an external reference only once the document is issued (`sent`, `paid`,
  `overdue`, or `cancelled`). Drafts use opaque `DRAFT-<uuid>` identifiers; deleting a draft does
  not consume an external number.
- Sequences are scoped to one workspace and one document series. Invoices and credit notes have
  separate lifetime counters; there is no automatic fiscal-period reset. Changing a prefix,
  separator, or digit width changes formatting but does not reset a counter.
- Issuance allocates and persists the number, status transition, and audit event in one database
  transaction under the workspace row lock. Concurrent issuance must not duplicate a number. A
  rolled-back issuance does not consume one.
- Issued and cancelled documents are never renumbered or hard-deleted. Cancellation retains the
  number and appends an audit event. Credit notes use their own series and refer to the original.
- Existing/imported external references are preserved. A collision is skipped because the retained
  document accounts for that reference. Future invoice imports must append an import event and
  advance a matching series counter when needed; invoice-history import is not currently supported.
- Manual counter changes are allowed for migration and operational recovery but must append an
  audit event. Therefore Nota promises unique, sequential application allocation between explicit
  configuration or collision boundaries, with an explained ledger from this migration onward—not
  universal numerical adjacency or blanket legal compliance.

No Rules Software SL owns the product policy. Keep ordinary invoicing capabilities available
without premium workflow tiers.
