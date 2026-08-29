# CODEX MASTER PROMPT — START HERE

Repository:
https://github.com/DevAbdoTolba/Dairy-System

Implement the Supplier Milk Collection + Supplier Account module described in the
attached planning package.

This is an EXISTING production-oriented repository.
Do NOT create another repository.
Do NOT reset it to an older SHA.
Do NOT replace existing features.

# A. First: inspect before coding

1. Clone/open current `main`.
2. Read:
   - `AGENTS.md`
   - `.agents/skills/dairy-system-engineering/**`
   - `README.md`
   - `docs/architecture.md`
   - `docs/offline.md`
   - auth/session implementation
   - existing IndexedDB/service-worker/outbox implementation
   - MongoDB repositories
   - current backup/restore
   - Vitest + Playwright configuration
3. Inspect `git log --oneline`.
4. Run baseline verification.
5. Record any existing failure instead of hiding it.
6. Create branch:
   `feat/supplier-milk-module`

Current HEAD may be newer than the planning package.
Repository reality is authoritative.

# B. Product requirements

Read and obey:

- `01-CONFIRMED-REQUIREMENTS.md`
- `02-ARCHITECTURE-AND-DATA-MODEL.md`
- `03-POS-UX-TRIE-AND-PREDICTION.md`
- `04-OFFLINE-SHIFT-CLOSE-AND-BACKUPS.md`
- `05-ACCEPTANCE-TESTS.md`
- `06-COMMIT-PLAN.md`

If these files are not physically inside the repo, add durable documentation under
`docs/` before implementation.

Explicit business requirements outrank assumptions.

# C. Keep the stack and architecture

Keep:

- Next.js;
- React;
- MUI;
- MongoDB;
- current modular monolith;
- current PWA/offline mechanisms;
- current test stack.

Do NOT add:

- microservices;
- separate backend;
- Redis;
- Kafka;
- broker;
- external recommendation/AI/ML service;
- broad state-management framework without a proven need;
- a second unrelated offline sync architecture.

Use the smallest number of new dependencies.

Domain code must remain free of:

- React;
- Next;
- MongoDB driver;
- browser APIs.

# D. Roles

Implement:

```ts
type Role = "OWNER" | "POS";
```

The two kitchen workers share one POS account.

POS:

- add milk;
- edit/delete current OPEN shift;
- record cash given to supplier;
- see supplier name;
- see owner-written instruction;
- close shift by PIN re-entry.

POS must NOT receive:

- balance;
- debt;
- historical financial data;
- settlements;
- reports.

Do not merely hide fields in UI.
Enforce server/API authorization.

Extend existing auth instead of installing a new auth framework.

Use existing secure PIN hashing style.

Add initial config such as:

```text
DAIRY_POS_PIN=
```

Owner should be able to change it.

# E. Suppliers

50+ suppliers.

Never require:

- photos;
- RFID/NFC;
- supplier-owned tags/cards;
- supplier numeric-ID workflow;
- supplier phones/accounts;
- routine keyboard typing.

Use internal UUIDs only for software identity.

# F. Shift lifecycle

Two explicit shift types:

- MORNING;
- NIGHT.

A supplier normally comes once per shift.
Same supplier may come morning + night.

OPEN shift:

- POS add/edit/delete milk;
- POS cash.

CLOSED shift:

- POS immutable;
- local snapshot;
- queued server reconciliation;
- owner-only auditable correction if needed.

# G. Milk and exact quantities

Milk types:

- COW;
- BUFFALO.

Same supplier can bring both, stored as separate entries.

Exact quantity model:

```text
1 satl = 6 cups
1 cup = 4 quarters
1 satl = 24 quarter-cup units
```

Persist positive integer `quantityQuarterCupUnits`.

Never persist floating satls.

After first milk type is saved, provide large direct action to add the other milk type
for same supplier without re-searching.

# H. Money and prices

Use integer piasters.

No JS float money.

Cow and buffalo prices are independent.

Price changes by BUSINESS DATE, not shift.

Settlement uses historical price effective on each milk entry date.

Missing price:

- does NOT block POS intake;
- may block owner settlement with clear missing-date/type message.

No interest.
No late fees.
No compounding.
No finance profit.
Negative supplier balance is valid.

# I. Supplier accounting

Support ledger movements:

- POS cash out;
- owner cash out;
- goods charge;
- manual owner credit/debit.

Owner may:

- pay zero;
- pay partially;
- pay full;
- pay more than current earnings;
- carry positive/negative balance;
- record goods such as cheese;
- suggest deductions;
- hold payment for a period.

Keep repayment advice flexible.
Do not build a loan engine.

# J. POS cash advisory note

Owner can set free-text POS instruction.

Example:
`يمكن إعطاؤه حتى 500 جنيه`

This is advisory ONLY.

If POS actually gives 700, allow 700 and record reality.

Every POS cash event:

- timestamp;
- supplier;
- shift/date;
- amount;
- optional note;
- OWNER review pending.

Build an OWNER review queue.

# K. Stable word-level trie

Primary supplier selector is word-level/token-level trie.

Example:

```text
Abdo -> Ahmed -> Mohamed -> Tolba
```

At each prefix:

- show only valid next tokens;
- auto-select if only one supplier remains.

For Arabic:

- normalize conservatively internally;
- preserve display text.

CRITICAL:
Trie buttons must have deterministic fixed ordering.

The recommendation algorithm MUST NEVER reorder trie options.

# L. Top-3 prediction

Separate strip, at most 3 suppliers.

Use simple local/interpretable statistics:

- shift match;
- time bucket;
- historical shift frequency;
- arrival-time pattern;
- recent frequency;
- optional weekday.

Use smoothing.
Use deterministic tie break.

No ML dependency.
No AI service.
No embeddings.

After supplier is completed in current shift, normally suppress/down-rank them.

Exception:
after saving first milk type, keep same supplier selected and offer other milk type.

Manual trie always permits exceptional reselection.

# M. POS UI

Create a dedicated POS workspace.

Requirements:

- Arabic RTL;
- huge touch controls;
- stable positions;
- no unnecessary motion;
- no animated reordering;
- no hover requirement;
- no auto-scroll;
- no balance;
- current-shift timeline visible.

Flow:

```text
Morning/Night
    ↓
Top-3 prediction OR stable word trie
    ↓
Supplier
    ↓
Cow/Buffalo
    ↓
Satl/cup/quarter
    ↓
Save
    ↓
Other milk type OR Done
```

POS cash:

- supplier;
- owner instruction;
- amount;
- confirm.

# N. Offline-first

The repo already has PWA/IndexedDB offline behavior.

INSPECT IT AND EXTEND IT.

Supplier operations must write durably locally before depending on network.

Offline required:

- add;
- edit;
- delete;
- POS cash;
- close shift.

Use stable UUID/idempotency keys.

Queued data survives reload/session expiry.

Retry must be exact-once at business level.

# O. Close shift locally

POS presses `إنهاء الوردية`.

Re-enter POS PIN.

Must work offline.

On close:

1. locally verify credential;
2. freeze shift;
3. make POS read-only;
4. create versioned JSON snapshot;
5. compute SHA-256 checksum;
6. retain snapshot in durable browser storage;
7. from close user gesture, trigger named JSON download when supported;
8. queue close/snapshot for server;
9. show success even if remote services are down.

Suggested filename:

```text
DairySystem_YYYY-MM-DD_morning_<id>.json
DairySystem_YYYY-MM-DD_night_<id>.json
```

Do not pretend a PWA can silently write arbitrary filesystem files without browser
permission. Durable local browser storage is the guaranteed local layer.

For offline close PIN:

- derive salted local verifier after successful login;
- use Web Crypto;
- never store plaintext PIN.

# P. Google Drive backup

Implement Google Drive as optional independent backup.

One Google Cloud project belongs to Dairy System.
Owner connects his normal Google account.

Use OAuth Web Application flow.

Use least-privilege scope:

```text
https://www.googleapis.com/auth/drive.file
```

Request offline access/refresh token for unattended retries/scheduled backup.

Environment:

```text
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=
DAIRY_GOOGLE_TOKEN_ENCRYPTION_KEY=
```

Never commit secrets.

Never expose refresh token to browser.

Encrypt refresh token at rest server-side.

App-created folder structure:

```text
Dairy System Backups/
  Shift Snapshots/
  Weekly/
```

Remember app-created folder IDs.

## Backup policy

Closed shift:

- after server reconciliation, upload verified snapshot;
- Drive failure => pending/retry;
- never block close;
- never roll back business transaction.

Weekly:

- full Dairy System JSON backup;
- include old inventory data + new supplier data;
- upload to Weekly;
- owner button: Backup now;
- owner button: Retry pending;
- secure scheduler/cron endpoint may invoke same application service.

Do not make the app unusable if Google Drive is disconnected.

# Q. Settlement

Build OWNER settlement workflow.

For un-settled milk:

- resolve historical date/type price;
- snapshot per-line quantity, price, value;
- summarize cow/buffalo;
- apply account movements/carry;
- allow payment 0/partial/full/overpayment;
- allow negotiated deduction;
- allow negative closing carry;
- immutable settlement snapshot;
- print-friendly receipt.

Define and test one piaster rounding rule.

Recommended:
round half-up at each milk-delivery line.

Old settlement must not change after later price edits.

# R. Testing

Unit:

- quantity conversions;
- money rounding;
- historical prices;
- balance sign;
- trie;
- recommendation scorer.

Integration:

- supplier repository/indexes;
- idempotent sync;
- cow+buffalo same supplier;
- price changes;
- negative carry;
- settlements;
- POS cash review;
- closed shift immutability;
- backup schema.

E2E:

- POS login;
- morning shift;
- supplier trie;
- cow entry;
- buffalo same supplier;
- edit;
- POS cash;
- close;
- owner review;
- prices;
- settlement;
- POS authorization denial;
- tablet accessibility.

Offline E2E:

1. preload/login online;
2. offline;
3. add/edit/delete;
4. POS cash;
5. close;
6. reload offline;
7. verify local state;
8. reconnect;
9. exact-once reconciliation.

Google Drive integration must sit behind a small interface/port so tests use a fake
Drive implementation without real credentials.

Do not weaken existing tests.

Run:

```text
npm run verify
npm run test:e2e
```

plus focused suites.

# S. Documentation

Add/update:

- architecture;
- supplier business model;
- POS operation;
- offline behavior;
- shift close/recovery;
- historical prices;
- settlements;
- Google Drive setup;
- backup/restore.

Google Drive setup docs must explain:

1. create/select GCP project;
2. enable Drive API;
3. OAuth consent configuration;
4. create Web OAuth client;
5. redirect URI;
6. configure env secrets;
7. owner clicks Connect Google Drive;
8. owner signs in with normal Google account;
9. files consume owner's Drive quota;
10. disconnect/reconnect.

# T. Commit discipline

Follow the attached commit plan.

Use small Conventional Commits.
Do not rewrite existing history.
Do not dump everything into one commit.

# U. Completion

Before final answer:

- clean working tree;
- all verification passes or explicitly report pre-existing failure;
- show concise test results;
- show `git log --oneline` for feature commits;
- push branch if credentials allow;
- open PR if GitHub access allows;
- do NOT merge automatically.

PR summary must cover:

- user workflow;
- architecture;
- offline reliability;
- accounting;
- Drive backups;
- tests;
- known limitations.

Definition of done:

- existing Dairy System still works;
- full supplier POS shift works offline;
- POS never sees balances;
- cow + buffalo works;
- stable trie works;
- top-3 prediction works without moving trie;
- open shift edits/deletes;
- closed shift POS-immutable;
- local snapshot exists;
- reconnect exact-once sync;
- historical pricing settlement correct;
- negative balance valid;
- no interest anywhere;
- POS cash review exists;
- Drive backup/retry works;
- weekly full backup includes new data;
- tests/docs complete.

When clever and boring compete, choose boring and reliable.
