# Supplier Milk Collection and Accounts — Implementation Plan

Status: ready for implementation  
Branch: `feat/supplier-milk-module`  
Base: `b964206` (`main` and `origin/main`)  
Target: the existing Next.js/MongoDB/PWA modular monolith

## 1. Outcome

Add a bounded supplier module that lets a shared kitchen POS receive cow and buffalo milk from 50+ suppliers during explicit morning or night shifts, remain fully usable offline, close a shift into a durable verified snapshot, and synchronize exactly once. The owner receives supplier administration, historical prices, principal-only accounting, POS-cash review, flexible immutable settlements, full backup/restore, and optional Google Drive backups.

Reliability and accounting correctness outrank convenience. Existing cheese inventory remains independent and must continue to pass all regression tests.

## 2. Measured starting point

- Next.js 16.3.3, React 19.2.3, MUI 9.4, MongoDB driver 7.6, Zod 4, Vitest 4, and Playwright 1.62 are already installed.
- Authentication currently supports one owner PIN and one owner-only signed cookie.
- Every protected page currently requires the owner session and uses one owner navigation shell.
- The current IndexedDB database is version 1 and contains only queued cheese inventory `POST /api/transactions` records.
- Current offline submission is network-first with queue-on-failure. Supplier collection needs stronger local-durable-first semantics.
- The service worker only intercepts inventory transaction creates and caches the five current owner routes.
- MongoDB setup and indexes are centralized in `src/shared/db/index.ts`.
- Full backup format is version 1 and only exports the original inventory/auth collections.
- The tablet test viewport is already 1180 × 820 with touch enabled.
- `npm run verify` passes at the plan baseline: 3 unit files/6 tests passed, the build passed, and the Mongo-dependent integration cases were skipped because the test process had no `MONGODB_URI`. Final verification must run those cases against the local replica set rather than accept skips.
- No new runtime dependency is required for the core module. Google OAuth and Drive calls can use server-side `fetch`; Web Crypto/browser APIs cover the local verifier and checksums.

## 3. Scope boundaries

### Included

- Shared POS role and PIN, owner role preservation, and server-enforced authorization.
- Supplier lifecycle and owner-written POS instructions.
- Morning/night shift lifecycle.
- Cow/buffalo milk entries using integer quarter-cup units.
- Open-shift edit and soft-delete with immutable audit events.
- Stable Arabic word-token trie and separate deterministic top-three suggestions.
- POS cash entry without any financial response fields.
- Historical price periods in integer piasters.
- Principal-only supplier account ledger, owner review, and advisory repayment instructions.
- Immutable settlement calculation snapshots and print view.
- Durable-first outbox, local POS bootstrap cache, local shift state, offline close, and exact-once reconciliation.
- Local versioned shift snapshots with SHA-256 and user-triggered JSON download.
- Backup format v2, Google Drive OAuth/backup retry, and weekly full backups.
- Unit, integration, E2E, offline, accessibility, backup, and regression coverage.

### Excluded

- Customer fresh-milk/rayeb sales, supplier phones/accounts, photos, cards, RFID/NFC, human numeric IDs, automated lending/installments, interest, late fees, payment gateways, ML/AI recommendations, microservices, Redis, brokers, and automatic coupling to cheese inventory.
- A `GOODS_CHARGE` records the supplier-account fact only. If cheese stock must also be reduced, the owner records that through the existing inventory workflow; the supplier module will not secretly mutate another bounded context.

## 4. Non-negotiable design decisions

### 4.1 Module boundary

Create `src/modules/suppliers/` with pure domain code, application services, MongoDB repositories, and UI. Only `src/modules/suppliers/index.ts` is public to routes or other modules. Domain files import no React, Next.js, MongoDB, or browser APIs.

Shared concerns stay shared:

- role-aware session primitives in `src/modules/auth/`;
- generic outbox and local persistence in `src/shared/offline/`;
- full-system backup and Drive adapter in `src/shared/backup/`;
- application shell components in `src/shared/design-system/`.

### 4.2 Roles and sessions

Replace the owner-specific payload with a signed, HttpOnly, SameSite=Strict session containing `sub`, `role`, `credentialVersion`, and expiry. Expose explicit helpers:

```ts
requireOwner();
requirePosOrOwner();
validateMutation(request, allowedRoles);
```

The login screen asks whether the user is entering as owner or milk-collection POS, then validates the corresponding PIN. Owner goes to `/dashboard`; POS goes to `/pos`. The current owner hashing/rate-limit style is retained. The owner can rotate the POS PIN; rotation increments `credentialVersion` and invalidates server-side POS sessions on their next online request.

POS pages use a dedicated minimal `PosShell`. Owner-only navigation, reports, settings, balances, price screens, and settlement screens are never rendered or fetched for a POS session.

### 4.3 Exact units and money

Persist milk quantity only as a positive integer `quantityQuarterCupUnits`:

```text
1 satl = 24 units
1 cup = 4 units
1 quarter cup = 1 unit
```

Persist money only as integer piasters. Delivery-line valuation uses positive integer arithmetic and half-up rounding:

```text
valuePiasters = floor((quantityQuarterCupUnits * pricePiastersPerSatl + 12) / 24)
```

The rule is applied per milk line and the result is frozen in the settlement snapshot.

### 4.4 Ledger and settlement semantics

The ledger is authoritative; no manually editable balance is stored.

- Milk value: increases the amount owed to the supplier.
- POS/owner cash out: decreases it.
- Goods charge: decreases it.
- Manual credit: increases it.
- Manual debit: decreases it.
- Negative balances are valid.
- No field, scheduled process, or calculation may add interest, late fees, compounding, or time-based charges.

A settlement snapshots selected unallocated milk lines, account movements, opening carry, prices, line values, payment, and closing carry. Its payment creates exactly one linked `OWNER_CASH_OUT` ledger movement in the same MongoDB transaction. `selectedDeductionPiasters` and hold-payment instructions are advisory inputs to the suggested payment only; they never post another hidden charge.

Settled milk/movement records receive settlement linkage metadata but their original business facts remain unchanged. Later price changes cannot alter a prior settlement snapshot.

### 4.5 Audit and idempotency

Milk entries may change only while their shift is open. They retain `revision`, `updatedAt`, and `deletedAt`, while every create/edit/delete/close/cash/owner-correction command writes an immutable `supplierEvents` record keyed by client-generated command UUID. A duplicate command returns its stored outcome.

All multi-document supplier mutations run in MongoDB transactions. Optimistic `expectedRevision` checks prevent silent overwrites. After close, POS mutations fail server-side; owner corrections create linked compensating facts and audit events rather than rewriting closed history.

### 4.6 Offline architecture

Upgrade `dairy-offline` to a generic versioned database without losing existing queued cheese operations. IndexedDB v2 contains:

- `outbox`: typed, ordered, idempotent commands for inventory and suppliers;
- `supplierBootstrap`: POS-safe supplier/trie/prediction data;
- `supplierShiftState`: current local shift and timeline;
- `supplierSnapshots`: closed-shift JSON and checksum;
- `posCredentialVerifier`: versioned salted local close verifier.

Supplier mutations follow durable-local-first order: create IDs → commit local state and outbox in one IndexedDB transaction → render success → request sync. The service worker and open-window fallback replay the same typed outbox in creation order. Existing inventory wrapper APIs remain compatible while their v1 records are migrated safely.

The POS bootstrap contract contains names, normalized tokens, stable order, owner instruction, limited visit statistics, and current shift state only. It contains no balances, account movements, settlements, price history, or historical earnings.

### 4.7 Offline shift close

After a successful online POS login, derive a device-local verifier with versioned PBKDF2-SHA-256 parameters and a random salt using Web Crypto; never store the PIN. Closing requires the PIN again and applies a local attempt limit.

On close, in one local transaction:

1. verify the local credential;
2. freeze the shift;
3. produce canonical, deterministically ordered JSON;
4. calculate SHA-256 over the payload excluding checksum metadata;
5. persist the snapshot and close command;
6. make the local shift read-only;
7. trigger a named JSON download from the user gesture when the browser permits it.

The close command carries the complete snapshot as a terminal recovery envelope. On reconnect, the server verifies the checksum, idempotently reconciles all included entry/cash IDs, and closes the server shift. This makes the close snapshot capable of recovering preceding commands while FIFO replay remains the normal path.

PIN rotation cannot revoke a verifier on a device that is completely offline and unaware of the change; this security tradeoff must be documented. On the next online bootstrap, a credential-version mismatch invalidates the old verifier.

### 4.8 Tablet POS layout

At the target 1180 × 820 tablet viewport, routine milk entry must not require whole-page scrolling:

- compact top bar: explicit morning/night, business date, shift state, and calm sync state;
- RTL one-third control rail: top-three strip, stable word trie, back/reset, and current supplier context;
- RTL two-thirds action workspace: milk type, satl/cup/quarter controls, save, cash action, and “other milk type” continuation;
- current-shift timeline in a bounded region with its own scroll only when needed.

Touch controls target 56–64 px where practical and never fall below 44 px. Predictions may change only inside their labeled strip and never reorder trie buttons. No hover dependency, auto-scroll, decorative animation, or color-only state is allowed. The layout must remain usable at 200% zoom and must not overflow horizontally.

### 4.9 Drive is backup, never availability

Use a small server-only `DriveBackupPort` and a fake implementation in tests. The real adapter uses OAuth `drive.file`, offline access, CSRF `state`, and app-created folder IDs. Encrypt the refresh token with AES-256-GCM using a 32-byte environment key; never return it to the browser.

Drive failure creates or updates a retryable backup job and never changes shift/business success. The app remains fully functional when Drive is disconnected.

## 5. Target code shape

```text
src/modules/suppliers/
  domain/
    quantity.ts
    money.ts
    supplier.ts
    shift.ts
    milk-entry.ts
    account-ledger.ts
    price-period.ts
    settlement.ts
    trie.ts
    prediction.ts
  application/
    supplier-service.ts
    shift-service.ts
    account-service.ts
    settlement-service.ts
    ports.ts
  infrastructure/
    repository.ts
  ui/
    pos-workspace.tsx
    supplier-selector.tsx
    quantity-pad.tsx
    shift-timeline.tsx
    supplier-admin.tsx
    account-panel.tsx
    settlement-panel.tsx
  tests/
  index.ts

src/app/
  (pos)/pos/page.tsx
  (pos)/pos/layout.tsx
  (protected)/suppliers/...
  (protected)/supplier-prices/...
  (protected)/supplier-settlements/...
  api/pos/bootstrap/route.ts
  api/supplier-shifts/route.ts
  api/supplier-shifts/[id]/milk/route.ts
  api/supplier-shifts/[id]/milk/[entryId]/route.ts
  api/supplier-shifts/[id]/cash/route.ts
  api/supplier-shifts/[id]/close/route.ts
  api/suppliers/...
  api/supplier-prices/...
  api/supplier-accounts/...
  api/supplier-settlements/...
  api/integrations/google-drive/...
  api/backups/retry/route.ts
  api/backups/weekly/route.ts

src/shared/offline/
  offline-schema.ts
  offline-store.ts
  offline-sync.ts
  supplier-local-state.ts
  shift-snapshot.ts

src/shared/backup/
  backup.ts
  drive-backup-port.ts
  google-drive-adapter.ts
  backup-job-service.ts
```

File names may be split when a file becomes hard to review, but boundaries and public APIs must remain as above.

## 6. MongoDB model and required indexes

| Collection                      | Purpose                                                              | Required indexes/invariants                                                                                    |
| ------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `suppliers`                     | Names, normalized tokens, stable order, active flag, POS instruction | unique `_id`; stable `sortOrder`; index `active + sortOrder`                                                   |
| `supplierShifts`                | Morning/night lifecycle and snapshot metadata                        | unique `businessDate + type`; index `status + businessDate`                                                    |
| `supplierMilkEntries`           | Current milk fact with revision/soft-delete                          | unique `_id`; index `shiftId + createdAt`; index `supplierId + businessDate`; optional unique `idempotencyKey` |
| `supplierMilkPrices`            | Cow/buffalo effective-date price periods                             | unique `milkType + effectiveFrom`; lookup index descending by effective date                                   |
| `supplierAccountMovements`      | Cash, goods, and explicit principal movements                        | unique `_id`; index `supplierId + businessDate`; index `ownerReviewStatus + createdAt`; index `settlementId`   |
| `supplierRepaymentInstructions` | Owner-only advisory deduction/hold/note                              | unique `supplierId`                                                                                            |
| `supplierSettlements`           | Immutable calculation and receipt snapshot                           | unique `_id`; index `supplierId + createdAt`; unique payment movement link when present                        |
| `supplierEvents`                | Immutable command receipt and audit trail                            | unique command `_id`; index `aggregateType + aggregateId + createdAt`                                          |
| `appIntegrations`               | Encrypted Drive credential and owned folder IDs                      | unique integration `_id`; server-only access                                                                   |
| `backupJobs`                    | Shift/weekly Drive upload state and retry details                    | unique `kind + artifactId`; index `status + nextAttemptAt`                                                     |

Supplier documents use UUID strings as `_id` to match the current repository style. Every business date is `YYYY-MM-DD` in `Africa/Cairo`; technical timestamps are UTC ISO strings.

## 7. Server contracts and authorization

### POS-safe contracts

- `POST /api/auth/login`: accepts `{ role, pin }`; returns role and redirect target. Successful POS login also returns public verifier parameters/credential version, never a stored verifier or hash.
- `GET /api/pos/bootstrap`: POS or owner; returns only active suppliers, POS instructions, normalized trie data, limited prediction statistics, and the selected/current shift timeline.
- `POST /api/supplier-shifts`: POS or owner; explicitly opens/retrieves one date/type shift.
- Milk create/update/delete routes: POS or owner, open shift only, UUID command key and expected revision required.
- `POST /api/supplier-shifts/[id]/cash`: POS or owner; positive piasters, advisory note never enforced as a limit, POS source always creates `PENDING` owner review.
- `POST /api/supplier-shifts/[id]/close`: POS or owner; verifies command/snapshot and closes idempotently.

Automated contract tests must assert forbidden finance keys are absent from serialized POS responses, not merely invisible in the UI.

### Owner-only contracts

- Supplier create/update/archive and POS instruction.
- POS PIN rotation.
- Price-period create/update/history.
- Account ledger/history, goods/cash/manual movement, repayment advice, and POS-cash review.
- Settlement preview and atomic confirm; print route reads only a stored snapshot.
- Closed-shift view and auditable correction.
- Drive connect/callback/status/disconnect, backup-now, retry-pending, and weekly scheduler endpoint.
- Full backup download and restore.

Every mutation uses the existing same-origin check plus an explicit role check. OAuth callback validates signed state. Scheduled backup uses a dedicated bearer secret and never an owner browser cookie.

## 8. Delivery phases

Each phase must be buildable and reviewable. Add the named focused tests before or with behavior, then run those tests before committing.

### Phase 0 — Durable decisions and baseline

1. Add the supplier requirements/architecture/acceptance package under `docs/suppliers/` in normalized UTF-8 names.
2. Add an ADR covering roles, ledger signs, settlement formula, local-durable-first outbox, snapshot checksum, and Drive-as-backup.
3. Add environment placeholders with no secrets.
4. Record baseline verification and the requirement that final Mongo integration tests may not be skipped.

Commit: `docs: define supplier milk module decisions`

### Phase 1 — Role-aware authentication

1. Generalize signed sessions while preserving owner behavior.
2. Add the shared POS account, rate limiting, login role choice, POS route guard, and minimal POS shell.
3. Add owner-only POS PIN rotation and credential versioning.
4. Add Web Crypto local verifier creation/validation with a documented offline threat model.
5. Test owner access, POS access, cross-role denial, cookie tampering, rate limiting, rotation, and offline verifier behavior.

Commit: `feat(auth): add shared POS role and permissions`

### Phase 2 — Supplier domain and owner management

1. Implement conservative Arabic normalization: Unicode normalization, remove tatweel/diacritics, normalize Alef variants, preserve displayed text, and do not collapse `ة` into `ه`.
2. Add suppliers, stable owner-controlled `sortOrder`, activation/archive, and POS instruction.
3. Add owner tablet CRUD pages and API validation.
4. Seed only development fixtures; never production supplier names.
5. Test 50+ supplier ordering, normalization, archive behavior, and instruction updates.

Commit: `feat(suppliers): add supplier management`

### Phase 3 — Shifts and exact milk ledger

1. Add pure quantity helpers and boundary tests, including all six package examples.
2. Add explicit morning/night open/retrieve lifecycle.
3. Add cow/buffalo create, edit, soft-delete, revision checks, immutable events, and closed-shift rejection.
4. Permit multiple entries and both milk types for one supplier in a shift.
5. Add MongoDB indexes and integration tests for concurrency, idempotency, and close immutability.

Commit: `feat(suppliers): add milk shifts and exact quantity ledger`

### Phase 4 — Tablet POS collection workspace

1. Add the compact shift picker/header and POS-safe bootstrap.
2. Add separate top-three placeholder strip and stable token trie; unique remaining supplier auto-selects.
3. Add the two-column tablet workspace, milk-type controls, exact satl/cup/quarter pad, save confirmation, and current-shift timeline.
4. Keep the supplier selected after the first milk type and offer the other type directly.
5. Add edit/delete confirmation for open-shift milk and retain exceptional manual reselection.
6. Test RTL, focus order, accessible names, 44 px minimum targets, 200% zoom, 1180 × 820 no routine page scroll, mobile stacking, and no horizontal overflow.

Commit: `feat(pos): add stable supplier milk workspace`

### Phase 5 — Deterministic prediction

1. Implement a pure, interpretable scorer using smoothed shift, time-bucket, recent-attendance, and optional weekday counts.
2. Return at most three results, tie-break by persisted supplier order/ID, and strongly suppress completed suppliers only after leaving their workspace.
3. Keep prediction data in the POS-safe bootstrap/cache; never call an external service.
4. Prove through tests that morning/night and time history affect suggestions while trie order never moves.

Commit: `feat(pos): add shift-aware supplier predictions`

### Phase 6 — Generic durable-first offline engine

1. Upgrade IndexedDB from v1 to v2 and migrate queued inventory operations without loss.
2. Replace endpoint-specific queue logic with a typed allowlisted outbox while preserving existing inventory APIs/tests.
3. Persist supplier bootstrap, local shift state, local optimistic timeline, and all supplier commands atomically.
4. Extend the service worker cache routes and FIFO replay for milk create/edit/delete and later cash/close commands.
5. Handle expired sessions as retained reviewable commands, not deletions.
6. Add reload, browser-restart, retry, duplicate, migration, and rejected-command tests.

Commit: `feat(offline): sync supplier mutations durably`

### Phase 7 — Prices, accounts, POS cash, and review

1. Add integer-piaster helpers, line rounding tests, and historical cow/buffalo price lookup.
2. Allow milk intake with missing prices; return precise missing date/type errors only from settlement preview.
3. Add signed principal ledger movements and advisory repayment instructions.
4. Add POS cash amount presets/keypad and optional note without fetching balance.
5. Add owner review queue and owner account history; advice never blocks recording actual cash.
6. Test negative balance, 500-advice/700-actual cash, review status, no-interest invariant, and POS response redaction.

Commits:

- `feat(accounts): add historical milk prices and ledger`
- `feat(accounts): add POS cash review and instructions`

### Phase 8 — Immutable settlements

1. Build an owner preview that selects all eligible unallocated facts through a cutoff date and resolves price per delivery date/type.
2. Show cow/buffalo separately, movements, opening carry, advice, payment options, and closing carry.
3. Confirm in one transaction: revalidate revisions/unallocated sources, save frozen lines/totals, link sources, and create one payment movement if nonzero.
4. Add owner override for suggested deduction/hold, without automatic posting.
5. Add print-friendly stored receipt/history.
6. Test zero/partial/full/overpayment, goods, negative carry, missing prices, concurrent confirm, and price edits after settlement.

Commit: `feat(settlements): add immutable supplier settlements`

### Phase 9 — Offline close and recovery snapshot

1. Implement canonical snapshot serialization, checksum, durable snapshot store, and safe filename.
2. Require local POS PIN re-entry and freeze the shift offline.
3. Trigger the optional JSON download and retain the guaranteed IndexedDB copy.
4. Reconcile the complete snapshot server-side, verify checksum, close exactly once, and expose owner recovery view.
5. Add owner correction as compensating facts only.
6. Test offline close, reload while offline, mutation denial after close, tamper rejection, repeated close, and full reconnect recovery.

Commit: `feat(shifts): close shifts with durable snapshots`

### Phase 10 — Full backup v2 and Google Drive

1. Extend full backup to version 2 with every supplier collection and rebuildable indexes/projections; keep version-1 import compatibility with an explicit old-backup warning.
2. Add `DriveBackupPort`, fake adapter tests, OAuth connect/callback/disconnect, encrypted refresh credential, remembered app-created folder IDs, and status UI.
3. Queue every reconciled closed-shift snapshot for Drive; failures remain pending and never reopen/fail the shift.
4. Add manual retry/backup-now and one idempotent weekly full-backup service callable by a protected scheduler route.
5. Ensure weekly files include original inventory plus all supplier/account/price/settlement configuration required for recovery.
6. Test Drive outage/retry, duplicate scheduler calls, encrypted-token handling, backup schema, restore references, and projection rebuild.

Commit: `feat(backups): add Drive supplier backup and full export v2`

### Phase 11 — End-to-end hardening and release handoff

1. Extend Playwright with owner login, POS login, morning shift, trie, cow then buffalo, edit/delete, POS cash, close, owner review, prices, settlement, print view, and role denial.
2. Add full offline scenario: preload → offline → add/edit/delete/cash/close → reload offline → reconnect → exact-once database result.
3. Run axe on owner and POS critical pages for mobile/tablet/desktop; manually inspect focus, 200% zoom, stable controls, and target-tablet screenshots.
4. Run Mongo integration tests against the local replica set with zero skips.
5. Run `npm run verify` and `npm run test:e2e`; fix regressions rather than weakening old tests.
6. Update architecture, data model, offline, operations, testing, owner guide, POS guide, settlement guide, Drive setup, and restore guide.
7. Review the diff for leaked finance fields, secrets, floats, hidden automatic postings, unnecessary dependencies, cross-module coupling, and animation.

Commits:

- `test: cover supplier workflows and offline recovery`
- `docs: add supplier operations and backup guides`

## 9. Dependency order and safe parallel work

```text
Auth roles ───────────────┐
Supplier management ─────┼─> Shift/milk API ─> POS UI ─> Offline close
Quantity domain ─────────┘          │              │
                                    └─> Prediction ┘

Money/prices ─> Account ledger ─> POS cash review ─> Settlements

Snapshot close ─> Backup v2 ─> Drive jobs/retry

All paths ─> E2E/accessibility/regression/docs
```

Domain tests and isolated UI components can proceed independently inside a phase, but shared auth, IndexedDB schema, Mongo indexes, and backup schema changes must remain serialized to avoid incompatible migrations.

## 10. Verification matrix

| Layer                    | Required proof                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain unit              | quantity conversions, piaster rounding, sign map, price lookup, settlement formula, Arabic normalization, trie, prediction                  |
| Application unit         | role guards, snapshot canonicalization/checksum, no-interest invariant, POS DTO redaction, backup job retry                                 |
| Mongo integration        | indexes, command idempotency, revision conflict, cow+buffalo, shift close, cash review, historical price, atomic settlement, backup/restore |
| IndexedDB/service worker | v1 migration, atomic local write, reload survival, ordered replay, session expiry retention, exact-once retry, snapshot retention           |
| API contract             | POS cannot retrieve finance fields or owner routes; same-origin and role checks on every mutation                                           |
| E2E online               | complete POS shift and complete owner accounting/settlement workflow                                                                        |
| E2E offline              | add/edit/delete/cash/close/reload/reconnect with exact final server facts                                                                   |
| Accessibility/tablet     | RTL, axe, touch sizing, visible focus, 200% zoom, no routine tablet page scroll/overflow, stable trie                                       |
| Backup failure           | Drive unavailable does not block close; pending job retries idempotently; weekly v2 restores all modules                                    |
| Regression               | existing inventory, reports, PWA, backup v1 compatibility, and owner login remain functional                                                |

## 11. Environment and deployment additions

```text
DAIRY_POS_PIN=<initial private POS PIN>
GOOGLE_OAUTH_CLIENT_ID=<server OAuth client id>
GOOGLE_OAUTH_CLIENT_SECRET=<server OAuth client secret>
GOOGLE_OAUTH_REDIRECT_URI=https://<deployment>/api/integrations/google-drive/callback
DAIRY_GOOGLE_TOKEN_ENCRYPTION_KEY=<base64 32-byte key>
DAIRY_BACKUP_CRON_SECRET=<long random scheduler bearer secret>
```

Add placeholders only to `.env.example`. Production/Preview secrets stay in Vercel, and preview must not run restore or backup jobs against production data. Google Drive remains optional; missing Google variables disable only connection/Drive controls with a clear owner message.

## 12. Risk controls

- **Data loss during offline schema upgrade:** migrate v1 records in an IndexedDB upgrade transaction and keep migration fixtures/tests.
- **POS financial leakage:** construct dedicated POS DTOs and add negative contract assertions for forbidden keys.
- **Duplicate/off-order commands:** stable UUIDs, immutable command receipts, FIFO replay, optimistic revisions, and snapshot terminal reconciliation.
- **Settlement double counting:** atomically claim source facts and create one linked payment movement; advisory deductions never post.
- **Closed-shift mutation:** enforce in domain/application/database transaction and API, not only disabled buttons.
- **Drive outage/token loss:** encrypted server-only credential, retryable jobs, local/Mongo copies first, Drive never in the transaction path.
- **Old backup compatibility:** versioned validator and explicit v1 restore path; v2 round-trip integration test.
- **Tablet crowding:** compact dedicated POS shell, bounded timeline scrolling, fixed control regions, and screenshot/overflow assertions at 1180 × 820.
- **Feature size:** keep commits buildable, avoid generic frameworks, and defer all explicit non-goals.

## 13. Definition of done

The module is complete only when:

- a POS worker can perform a full morning or night shift with no internet, reload, close locally, reconnect, and see exactly one server copy of every intended fact;
- the same supplier can record independent cow and buffalo milk without a second search;
- trie controls are stable and top-three suggestions never move them;
- POS responses and pages contain no balance, debt, settlement, price history, or earnings data;
- current open-shift milk can be edited/deleted, while closed shifts reject POS mutations and owner corrections remain auditable;
- prices are date/type correct, line rounding is deterministic, old settlements are immutable, negative carry is valid, and no interest/time charge exists;
- every POS cash movement appears in the owner review queue and advisory notes never prevent recording reality;
- local snapshot, MongoDB, Drive retry, and weekly full backup layers work independently as designed;
- backup v2 restores existing inventory plus supplier data and rebuilds projections;
- target tablet, mobile, keyboard, RTL, zoom, and accessibility gates pass;
- all focused suites, Mongo integrations with zero skips, `npm run verify`, and `npm run test:e2e` pass;
- documentation, environment template, small Conventional Commits, pushed feature branch, and unmerged PR are ready for owner review.
