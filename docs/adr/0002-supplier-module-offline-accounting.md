# ADR 0002: Supplier collection is a local-first ledger module

## Status

Accepted.

## Context

Kitchen workers must record supplier milk collection and cash movements during
network outages. The owner needs accurate, auditable supplier accounts without
introducing another service or exposing financial information to the shared POS
account.

## Decision

- Add one `suppliers` bounded module to the existing Next.js modular monolith.
- Use integer quarter-cup units for milk and integer piasters for money.
- Use an authoritative supplier ledger. Milk increases the amount owed; cash,
  goods, and debits decrease it; credits increase it. Negative balances are
  valid and no interest or time-based charge exists.
- Store an immutable command/audit event for every supplier mutation. An
  idempotency UUID makes retried offline commands exact-once.
- Extend the existing IndexedDB/service-worker outbox rather than adding a
  second offline mechanism. Supplier actions are durable locally before network
  synchronization is attempted.
- Keep POS bootstrap/API contracts deliberately financial-data-free. Role checks
  run on the server, not only in React.
- A closed shift is locally frozen with a canonical JSON snapshot and SHA-256
  checksum; the close envelope can reconcile its contents server-side.
- Google Drive is an optional encrypted server-side backup destination. Its
  failure never prevents collection, close, or MongoDB synchronization.

## Consequences

- The module adds role-aware session helpers, versioned IndexedDB migration,
  supplier collections/indexes, and a version-2 full backup schema.
- Settlements freeze values and prices at confirmation time. A suggested
  deduction is advisory metadata, never an automatic second posting.
- A device-local offline PIN verifier improves close availability but cannot be
  instantly revoked on a device that is completely offline; this limitation is
  documented and version-checked at the next online bootstrap.
