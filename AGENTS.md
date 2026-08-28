# Dairy System engineering rules

- Simplicity and maintainability are features. Preserve modular-monolith boundaries; do not add microservices, generic frameworks, or production dependencies without a written reason.
- Arabic RTL, keyboard access, visible focus, 44px+ controls, and no nonessential animation are mandatory.
- Inventory is an immutable ledger: never hard-delete a business transaction or edit an aggregate balance.
- Keep domain code free of UI, Next, ORM, and SQLite imports. Cross-module use must pass through public application interfaces.
- Validate on the server, preserve idempotency, and protect mutation routes with the owner session and same-origin checks.
- Update tests and documentation with behavior changes. Run `npm run verify` before committing completed behavior.
- Use Conventional Commits, small buildable commits, and never commit secrets or generated database files.
