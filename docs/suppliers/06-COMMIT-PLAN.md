# Suggested Git Commit Plan

Do not force exact commits if repository reality requires a slightly different split.
The goal is small, reviewable, buildable commits.

Suggested:

1. `docs: define supplier milk module decisions`
2. `feat(auth): add shared POS role and permissions`
3. `feat(suppliers): add supplier domain and management`
4. `feat(suppliers): add milk shifts and exact quantity ledger`
5. `feat(pos): add stable word-level supplier trie`
6. `feat(pos): add shift-aware top supplier predictions`
7. `feat(offline): sync supplier POS mutations offline`
8. `feat(accounts): add historical milk prices and account ledger`
9. `feat(accounts): add POS cash review and supplier instructions`
10. `feat(settlements): add flexible supplier settlements`
11. `feat(shifts): close shifts with durable local snapshots`
12. `feat(backups): add Google Drive backup integration`
13. `test: cover supplier workflows and offline recovery`
14. `docs: add supplier operations and backup guides`

Rules:

- Conventional Commits.
- Do not rewrite existing commits.
- Do not squash everything into one mega commit.
- Do not create meaningless commits just to hit a number.
- Run focused tests before each behavior commit when practical.
- Run full verify before final handoff.
