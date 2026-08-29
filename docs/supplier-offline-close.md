# Offline supplier-shift closure

After a successful POS login, the browser derives and stores a salted PBKDF2-SHA-256 verifier using the POS PIN. The PIN itself is never retained. Re-entering the PIN is required to close a shift; five local failures cause a 15-minute local lock.

Closing is durable-local-first. In one IndexedDB transaction the app stores the read-only local shift state, its SHA-256 checksummed canonical snapshot, and an idempotent close command. A JSON copy is also offered as a user download. Supplier outbox replay is FIFO, so locally saved milk/cash commands reach the server before the close command.

The close route re-computes the checksum, checks that the snapshot identifies the requested date/type/shift, and closes exactly once. A closed shift rejects milk and cash mutations on both the server and the tablet UI.

Security boundary: a completely offline device cannot learn that the owner rotated the POS PIN. On its next online bootstrap, a changed credential version removes the stale local verifier; the worker must log in online again before another offline close.

The close snapshot is also a terminal recovery envelope. If earlier local milk or cash commands did not reach the server, a verified snapshot replays those exact facts and queues the snapshot for Drive inside the same database transaction as the shift close. The Drive upload itself runs later and can never reopen or fail a closed shift.
