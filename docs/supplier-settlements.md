# Supplier settlements

A settlement is a receipt snapshot, not a recalculation of a mutable balance.

1. The owner selects a supplier, milk type, and cutoff business date.
2. Preview loads unallocated deliveries and ledger movements for that supplier's selected milk type through that date. Each milk line resolves its historical price; a missing price prevents confirmation and names the uncovered date/type.
3. Repayment advice may suggest a payment or hold it at zero. Advice never posts a deduction.
4. On confirmation, one MongoDB transaction re-reads and claims every displayed source fact, saves the frozen lines/totals/carry, and creates one linked `OWNER_CASH_OUT` movement only when an actual payment is entered.

After confirmation, later price edits cannot change the stored receipt. A settlement can legitimately have zero payment, partial payment, or overpayment, producing a negative closing carry. There is no interest or automatic charge.
