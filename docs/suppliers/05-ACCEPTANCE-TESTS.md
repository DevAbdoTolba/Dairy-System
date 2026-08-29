# Acceptance Tests

## Authorization

- OWNER can access supplier accounts/settlements.
- POS cannot access supplier balance/account/history.
- POS API response does not contain balance.
- POS can see supplier name and OWNER instruction.
- Shared POS login works.
- Existing OWNER auth still works.
- Closing shift requires POS PIN re-entry.

## Supplier trie

- Works with 50+ suppliers.
- Token-by-token selection works.
- Unique remaining supplier auto-selects.
- Trie order is deterministic across reloads.
- Prediction never reorders trie.
- Manual trie can still select a supplier already seen in current shift.

## Prediction

- Max 3 suggestions.
- Morning history influences morning.
- Night history influences night.
- Time-of-shift history influences score.
- Current-shift handled supplier normally down-ranks/disappears.
- deterministic tie-break.
- no external ML service.

## Quantity

Must pass:

```text
1 satl                = 24
1 cup                 = 4
2 satl                = 48
2 satl - 1 cup        = 44
1 satl + 3 cups       = 36
2 satl - 1/4 cup      = 47
```

- no float storage;
- zero/negative rejected.

## Cow + buffalo

- same supplier can save cow and buffalo in same shift as two records;
- UI offers "other milk type" without supplier re-search;
- entries remain independent.

## Open shift

- POS add works.
- POS edit works.
- POS delete works.
- timeline updates immediately.
- offline edit/delete survives reload.
- POS cannot modify CLOSED shift.

## Historical prices

Example:

```text
Cow 2026-08-01 = 30 EGP/satl
Cow 2026-08-10 = 32 EGP/satl
```

- Aug 9 -> 30;
- Aug 10 -> 32;
- shift does not affect price;
- buffalo independent;
- missing price does not block POS intake;
- missing price blocks settlement with useful error;
- old settlement snapshot remains unchanged after later price edit.

## Supplier account

```text
Milk earned     +50 EGP
Cheese taken   -150 EGP
Balance        -100 EGP
```

is valid.

- cash decreases amount owed;
- goods decrease amount owed;
- negative balance valid;
- no interest;
- no late fees;
- no time-based increase.

## POS cash

- POS can record 20 EGP without seeing balance.
- exact timestamp saved.
- marked OWNER review pending.
- OWNER note visible.
- note is advisory.
- note says 500 -> POS can still record 700.
- owner review surfaces the 700 record.

## Settlement

- payment can be zero.
- payment can be partial.
- payment can be full.
- payment can exceed current earned amount.
- closing carry may be negative.
- goods charge included.
- advisory deduction can prefill.
- owner can override.
- hold-payment note can suggest zero.
- owner can override.
- immutable calculation snapshot is saved.
- print-friendly receipt exists.

## Offline

After first online setup:

- supplier cache usable offline;
- trie usable offline;
- prediction usable offline;
- milk add/edit/delete works offline;
- POS cash works offline;
- close works offline;
- snapshot survives reload;
- reconnect syncs exactly once;
- repeated retry does not duplicate.

## Shift snapshot

- generated on close;
- versioned JSON;
- SHA-256 checksum;
- date + morning/night in filename;
- durable local copy remains;
- POS cannot accidentally reopen/edit;
- owner can view closed shift.

## Google Drive

- uses `drive.file`;
- supports offline access/refresh credential;
- refresh token never reaches client;
- app-created folder used;
- shift upload can fail without failing business data;
- pending backup visible;
- retry is idempotent;
- weekly full backup includes current inventory + suppliers.

## Regression

- existing cheese inventory workflows continue to pass.
- existing offline inventory behavior remains.
- PWA remains installable.
- backup/restore tests are extended, not removed.
- `npm run verify` passes.
- Playwright covers target tablet.
- no new layout jumping/essential animation.
