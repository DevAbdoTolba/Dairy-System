# Supplier prices and accounts

Set a cow or buffalo price in integer piasters per satl and give it an effective date. Each delivery uses the newest price at or before its business date. Intake continues when no price exists; that delivery is simply marked unpriced until a price period covers it.

Supplier balances are calculated from immutable facts, never stored as an editable field:

- priced milk and manual credit increase the amount owed to the supplier;
- POS cash, owner cash, goods, and manual debit decrease it;
- a negative balance is valid;
- there is no interest, late fee, automatic deduction, or time-based charge.

Each supplier has one financial account for each milk type they are allowed to bring. A supplier configured for both cow and buffalo milk therefore has two fully separate balances, movement histories, repayment instructions, and settlements. The owner sees those two accounts together under the supplier's name; a cow cash deduction can never affect the buffalo balance.

POS cash is saved locally first and is synchronised using the same idempotent supplier outbox as milk entries. It is recorded against the chosen cow or buffalo account and becomes a `PENDING` owner-review fact when the POS account records it. The POS API only returns an opaque cash-record id and the POS bootstrap contains no balances, prices, account movements, or settlement data.

Repayment advice is owner-only metadata for a later settlement. It does not post a ledger fact and cannot stop the POS from recording actual cash.
