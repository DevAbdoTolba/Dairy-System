# Supplier Module — Architecture and Data Model

## 1. Main architecture decision

KEEP the existing Dairy System modular monolith.

Do not create:

- another repo;
- another deployed backend;
- a microservice;
- a separate local server.

The existing design remains broadly:

```text
Tablet / PWA
    |
    | offline-capable local IndexedDB/outbox
    |
    +---- HTTPS ----> Existing Next.js app ----> MongoDB
```

The supplier module belongs inside the current application, e.g.:

```text
src/modules/suppliers/
  domain/
  application/
  infrastructure/
  ui/
  index.ts
```

If the module becomes large, internal subareas such as `collection`, `accounts`,
`settlements` are acceptable INSIDE the same bounded context.

---

# 2. Design principles

1. Milk collection must continue with zero internet.
2. MongoDB remains the synchronized main business database.
3. Local IndexedDB/outbox protects in-progress work.
4. Closed-shift snapshot creates an extra device-local recovery artifact.
5. Google Drive is independent backup storage, NOT an operational database.
6. Quantity is exact integer quarter-cup units.
7. Money is integer piasters.
8. POS can edit/delete only open-shift entries.
9. Closed history is auditable.
10. POS API responses do not leak admin financial information.
11. Prefer boring, explicit code over generic abstraction.

---

# 3. Suggested MongoDB concepts

Names may be adjusted to current repo conventions.

## suppliers

```ts
{
  _id: string;                 // UUID
  displayName: string;
  nameTokens: string[];
  sortKey: string;
  posInstruction: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}
```

## milkShifts

```ts
{
  _id: string;
  businessDate: "YYYY-MM-DD"; // Africa/Cairo
  type: "MORNING" | "NIGHT";
  status: "OPEN" | "CLOSED";
  openedAt: string;
  closedAt: string | null;
  closedByRole: "POS" | "OWNER" | null;
  snapshotHash: string | null;
  driveBackupStatus: "PENDING" | "UPLOADED" | "FAILED" | null;
  driveFileId: string | null;
}
```

Normal rule:

- one active shift for a specific date/type.

## milkEntries

```ts
{
  _id: string; // client-generated stable UUID
  shiftId: string;
  supplierId: string;
  milkType: "COW" | "BUFFALO";
  quantityQuarterCupUnits: number;
  businessDate: "YYYY-MM-DD";
  sourceRole: "POS" | "OWNER";
  idempotencyKey: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
```

POS "delete" may be soft-delete/audit-safe even while UI behaves simply.

Once shift is CLOSED:

- POS mutation APIs reject edits/deletes.

## milkPricePeriods

```ts
{
  _id: string;
  milkType: "COW" | "BUFFALO";
  effectiveFrom: "YYYY-MM-DD";
  pricePiastersPerSatl: number;
  createdAt: string;
  createdByRole: "OWNER";
}
```

For business date D:

- choose latest `effectiveFrom <= D`.

Prevent duplicate ambiguous effective dates for same milk type.

## supplierAccountMovements

```ts
{
  _id: string;
  supplierId: string;
  type:
    | "POS_CASH_OUT"
    | "OWNER_CASH_OUT"
    | "GOODS_CHARGE"
    | "MANUAL_CREDIT"
    | "MANUAL_DEBIT";
  amountPiasters: number;            // positive magnitude
  businessDate: "YYYY-MM-DD";
  shiftId: string | null;
  sourceRole: "POS" | "OWNER";
  note: string | null;
  ownerReviewStatus: "NOT_REQUIRED" | "PENDING" | "REVIEWED";
  createdAt: string;
}
```

Domain rules determine sign; do not allow arbitrary signed input everywhere.

## supplierRepaymentInstructions

Keep simple/advisory:

```ts
{
  supplierId: string;
  suggestedDeductionPiasters: number | null;
  holdPaymentUntil: "YYYY-MM-DD" | null;
  note: string | null;
  updatedAt: string;
}
```

No automatic money movement.

## supplierSettlements

Persist an immutable settlement snapshot.

At minimum keep:

```ts
{
  _id: string;
  supplierId: string;
  fromDate: string;
  toDate: string;

  openingCarryPiasters: number;

  milkLines: Array<{
    milkEntryId: string;
    milkType: "COW" | "BUFFALO";
    businessDate: string;
    quantityQuarterCupUnits: number;
    pricePiastersPerSatl: number;
    valuePiasters: number;
  }>;

  accountMovementIds: string[];

  milkTotalPiasters: number;
  selectedDeductionPiasters: number;
  cashPaidNowPiasters: number;
  closingCarryPiasters: number;

  createdAt: string;
}
```

Exact shape may follow repo style, but historical prices and line values MUST be
snapshotted.

---

# 4. Quantity domain

Pure constants/helpers:

```text
SATL_UNITS = 24
CUP_UNITS  = 4
QUARTER    = 1
```

Create/test helpers for:

- user selection -> integer units;
- normalization -> satl/cup/quarter display;
- exact addition/subtraction;
- validation.

No floating quantity.

---

# 5. Money domain

Use integer piasters.

```text
150 EGP = 15000 piasters
```

Milk valuation:

```text
numerator = quantityQuarterCupUnits * pricePiastersPerSatl
valuePiasters = round(numerator / 24)
```

Define ONE explicit rounding rule.

Recommended:

- round half-up to nearest piaster PER delivery line;
- store that line value in settlement snapshot.

Test boundary cases.

---

# 6. Balance model

Do not make a manually editable aggregate the source of truth.

Derive from ledger facts.

A projection/cache is allowed only if:

- it can be rebuilt;
- source ledger remains authoritative;
- tests verify rebuild.

Positive and negative balances are both valid.

---

# 7. Authentication

Extend existing auth/session implementation.

Roles:

```ts
type Role = "OWNER" | "POS";
```

One shared POS account.

Use existing secure hashing style.

Suggested env initialization:

```text
DAIRY_POS_PIN=
```

Owner can rotate it later.

Server helpers should make permissions obvious:

```text
requireOwner()
requirePosOrOwner()
```

Do not introduce a second auth framework.

---

# 8. Open vs closed shifts

OPEN:

- POS add;
- POS edit;
- POS delete;
- POS cash;
- local/offline mutations allowed.

CLOSED:

- POS read-only;
- no POS edit/delete;
- owner correction only through auditable path.

This is the main lifecycle boundary.

---

# 9. Independence from cheese inventory

Do not couple supplier milk ledger directly to current cheese inventory calculations.

Future modules can reuse supplier application services through public module APIs.

Preserve repository AGENTS.md rule:

- domain free of React/Next/database driver;
- cross-module access via public interfaces.
