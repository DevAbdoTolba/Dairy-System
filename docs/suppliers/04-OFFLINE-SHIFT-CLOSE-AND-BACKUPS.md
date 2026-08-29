# Offline Reliability, Shift Close, Local Snapshots, Google Drive

## 1. Reliability requirement

Kitchen collection MUST continue when:

- internet disappears;
- Vercel is unreachable;
- MongoDB Atlas is temporarily unreachable;
- Google Drive is unavailable.

No remote service may block milk collection.

Reuse and extend the repository's EXISTING PWA/IndexedDB offline queue.
Do not create a parallel local-server architecture.

---

# 2. Local-first mutations

For POS supplier actions:

```text
user action
   ↓
durable local IndexedDB record/outbox
   ↓
UI updates immediately
   ↓
attempt server sync
   ↓
server deduplicates via idempotency key
```

Offline support is mandatory for:

- add milk;
- edit open-shift milk;
- delete open-shift milk;
- POS cash movement;
- close shift.

Use stable client-generated IDs/idempotency keys before first network request.

Queued actions survive:

- reload;
- network loss;
- expired server session.

---

# 3. Local supplier cache

Cache enough POS-facing data after successful online load:

- active supplier names;
- normalized trie tokens;
- stable sort keys;
- POS instruction text;
- limited visit history/statistics needed by top-3 prediction;
- current/open shift state.

Do NOT cache/fetch admin balances into the POS data contract.

---

# 4. Closing a shift

POS explicitly presses:

```text
إنهاء الوردية
```

Then re-enters POS PIN/password.

Closing MUST work offline.

At close:

1. verify close credential;
2. freeze local shift;
3. POS cannot further edit it;
4. create deterministic versioned JSON snapshot;
5. compute SHA-256 checksum;
6. store snapshot durably in browser local persistent storage;
7. because close is a direct user gesture, also trigger a normal downloadable JSON
   file when supported;
8. queue server close/snapshot sync;
9. show clear "closed and saved on device" status.

Do not claim a browser can silently write arbitrary files anywhere on the filesystem.
Use the durable browser copy as the guaranteed local copy and the explicit
user-triggered download as the named file copy.

Suggested filename:

```text
DairySystem_2026-08-29_morning_<shortShiftId>.json
DairySystem_2026-08-29_night_<shortShiftId>.json
```

Snapshot should contain:

- schema version;
- shift ID;
- business date;
- shift type;
- open/close timestamps;
- milk entries;
- POS cash movements;
- supplier ID + display-name snapshot;
- exact quantity units;
- timestamps;
- checksum metadata.

Snapshot is recovery/audit material, not the everyday source of truth.

---

# 5. Offline close PIN

Closing must be possible if internet is down.

After a successful POS login, derive/store a salted local verifier using Web Crypto
or equivalent browser cryptography.

Never store plaintext PIN.

Document the security tradeoff.

Owner can invalidate/rotate the POS PIN when the device is online again.

---

# 6. Server reconciliation

When connection returns:

- replay pending create/edit/delete/cash actions idempotently;
- finalize closed shift server-side;
- compare/verify snapshot checksum;
- mark synchronization state;
- treat repeated identical retries as success.

Do not duplicate transactions.

---

# 7. Backup layers

Target:

```text
1. IndexedDB/outbox during active shift
2. Closed-shift durable local snapshot
3. Named downloaded shift JSON on the device when supported
4. MongoDB synchronized business database
5. Google Drive independent backup
6. Weekly full-system backup
```

This is redundancy, not multiple competing sources of truth.

---

# 8. Google Drive architecture

Google Drive is backup only.

## Ownership

Use ONE Google Cloud project for the Dairy System application.

The uncle connects his NORMAL Google account via OAuth.

Files created using his OAuth authorization live in his Drive and use his Drive
quota.

He does NOT need his own separate GCP project.

## OAuth

Use a Web OAuth client.

Least privilege:

```text
https://www.googleapis.com/auth/drive.file
```

Request offline access so refresh credentials can be used for scheduled/retry
backups.

Do not request full Drive scope unless a concrete requirement later proves
`drive.file` insufficient.

Never put OAuth refresh token/client secret in browser JS.

## Environment

Example:

```text
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=
DAIRY_GOOGLE_TOKEN_ENCRYPTION_KEY=
```

Encrypt persisted refresh token server-side before storing it in MongoDB.

---

# 9. Drive folder structure

The app creates and remembers IDs for folders it owns:

```text
Dairy System Backups/
  Shift Snapshots/
    2026/
      08/
  Weekly/
```

Because `drive.file` is intentionally narrow, prefer remembered app-created file and
folder IDs rather than broad scanning of the user's Drive.

---

# 10. Backup cadence

## Closed shifts

Recommended stronger policy:

- every CLOSED shift snapshot is eventually uploaded to Drive once server-side
  synchronization is available.

If Drive fails:

- mark backup PENDING/FAILED;
- retry later;
- NEVER roll back the business shift;
- NEVER block closing.

## Weekly

Create one full Dairy System JSON backup each week.

It must include:

- existing cheese/inventory data;
- supplier module data;
- prices;
- settlements;
- account movements;
- configuration required for recovery.

Upload to `Weekly/`.

Also provide OWNER:

- Backup now;
- Retry pending backups.

The weekly backup service should be callable by a secure scheduler/cron route, but
business correctness must not depend solely on one hosting vendor's scheduler.

---

# 11. Backup status UI

OWNER settings should show:

- Google Drive connected/disconnected;
- last successful closed-shift Drive backup;
- pending shift backup count;
- last successful weekly backup;
- latest error;
- Retry;
- Backup now;
- Disconnect.

POS does not see OAuth details.

---

# 12. Restore

Extend current full backup/restore to include new collections.

Restore should:

- validate schema version;
- validate basic references;
- rebuild projections/caches if used.

Shift snapshots are extra recovery artifacts; they are not a replacement for the
full DB backup format.

---

# 13. Required failure tests

Simulate:

1. go offline;
2. add milk;
3. edit milk;
4. delete another milk entry;
5. give supplier POS cash;
6. close shift;
7. reload while offline;
8. verify all local state remains;
9. reconnect;
10. exact-once server reconciliation;
11. Drive upload failure;
12. business data remains saved;
13. backup remains pending;
14. retry Drive;
15. backup succeeds;
16. weekly full backup contains supplier + existing Dairy System data.
