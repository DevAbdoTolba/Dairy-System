---
name: dairy-system-engineering
description: Build or modify the Dairy System inventory application. Trigger for inventory, production, sales, returns, reports, Arabic RTL UI, accessibility, SQLite, self-hosting, backups, Docker, testing, and Git changes in this repository. Enforce minimal modular-monolith architecture and reject unnecessary complexity.
---

1. Read requirements, architecture, and relevant module public APIs.
2. State the narrow behavior being changed.
3. Add or update domain-rule tests first.
4. Implement through domain, application, infrastructure, and UI boundaries.
5. Check Arabic RTL, mobile behavior, and accessibility.
6. Run focused tests, then `npm run verify`.
7. Update documentation or an ADR when architecture or operations change.
8. Review for unnecessary dependency, abstraction, motion, or cross-module coupling.
9. Commit with a precise Conventional Commit message.
