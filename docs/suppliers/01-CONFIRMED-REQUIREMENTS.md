# Supplier Milk Module — Confirmed Requirements

## 1. Scope

Add a new bounded module to Dairy System for:

- receiving fresh milk from 50+ village suppliers;
- two daily collection shifts: morning and night;
- cow milk and buffalo milk;
- very fast entry by two kitchen workers;
- supplier historical ledger;
- historical milk prices by date;
- cash paid to suppliers;
- goods/charges taken by suppliers;
- flexible settlements and carried balances;
- offline operation;
- shift closing and recovery snapshots;
- independent cloud backups.

Customer sales of fresh milk/rayeb are NOT part of this module.
That will be a future POS module.

---

# 2. Users

There are two authorization roles.

## OWNER / ADMIN

The uncle has full access.

He can:

- manage suppliers;
- see all financial information;
- set historical cow/buffalo milk prices;
- view/open/closed shifts;
- write instructions visible to POS workers for a supplier;
- review cash transactions entered by POS;
- add goods/cash/account movements;
- settle supplier accounts;
- make audited corrections when necessary;
- manage backups and Google Drive connection;
- change the POS PIN/password.

## POS

The two kitchen workers share ONE POS account.

The system does NOT need to identify which girl entered a transaction.
Every entry/action must have an exact timestamp because a physical camera already
exists and can be checked later.

POS can:

- choose morning/night shift;
- find/select a supplier;
- record cow milk;
- record buffalo milk;
- record both milk types as separate transactions;
- edit/delete milk entries in the CURRENT OPEN SHIFT;
- record cash given to a supplier;
- see supplier name;
- see an OWNER-WRITTEN instruction/note for that supplier;
- close the shift by re-entering the POS PIN/password.

POS must NOT see:

- supplier balance;
- supplier debt/credit;
- settlement history;
- reports;
- historical earnings;
- admin accounting screens;
- price tables unless later proven necessary for collection entry.

This restriction must exist in the server/API contract.
Do NOT fetch financial data to the POS and merely hide it in React.

---

# 3. Suppliers

There are more than 50 suppliers.

Real-world constraints:

- no supplier photos;
- no RFID/NFC;
- no cards/tags they must keep;
- no supplier phone/app/account;
- no supplier numeric-ID workflow;
- suppliers may be illiterate;
- normal kitchen operation should require almost no keyboard typing.

A supplier needs at least:

- internal UUID;
- Arabic display name;
- normalized name tokens for word-level trie navigation;
- deterministic stable sort key/order;
- active/inactive status;
- optional OWNER-written POS instruction;
- timestamps.

Internal UUIDs are implementation details only.

---

# 4. Shifts

Two shifts:

- MORNING
- NIGHT

A supplier normally comes ONCE per shift.
They may therefore come twice per day: one morning + one night.

A second visit in the same shift is almost zero probability, but exceptional reality
must still be recordable if needed.

The worker explicitly chooses morning/night at the beginning.
The system may suggest a shift based on time but must not silently decide it.

A shift is OPEN until explicitly closed.

While OPEN:

- POS may add/edit/delete its current-shift entries.

After CLOSE:

- POS cannot modify that shift;
- a local snapshot is created;
- server/cloud sync continues independently;
- owner corrections remain possible through an auditable owner path.

---

# 5. Milk types

Two types:

- COW
- BUFFALO

A supplier may bring both.

They are recorded as two separate milk transactions.

Example:

1. select supplier;
2. save cow milk;
3. immediately save buffalo milk for the SAME supplier without searching again.

---

# 6. Traditional measurement system

Confirmed conversion:

- 1 satl = 6 cups
- 1 cup = 4 quarters
- 1 satl = 24 quarter-cup units

Canonical persisted quantity:

```text
quantityQuarterCupUnits: positive integer
```

Examples:

```text
1/4 cup             = 1 unit
1 cup               = 4 units
1 satl              = 24 units
2 satl              = 48 units
2 satl - 1 cup      = 44 units
1 satl + 3 cups     = 36 units
2 satl - 1/4 cup    = 47 units
```

Never persist floating-point satls.

A satl being "around one kilogram" is context only.
Do NOT use kilograms as the accounting conversion.

---

# 7. Milk prices

Cow and buffalo milk have independent prices.

Price changes by BUSINESS DATE, not by shift.

Store money as integer piasters, never JS floating-point EGP.

Recommended:

```text
pricePiastersPerSatl
amountPiasters
```

Rules:

- settlement values each milk transaction using the price effective on its date;
- old settlements preserve the exact price/value used at the time;
- prevent ambiguous duplicate effective-date prices for the same milk type;
- missing price must NEVER block POS milk collection;
- missing historical price may block OWNER settlement and clearly identify which
  date/type must be configured.

---

# 8. Supplier financial account

Conceptually:

```text
Milk value earned by supplier    -> increases amount owed to supplier
Cash given to supplier           -> decreases amount owed to supplier
Goods taken by supplier          -> decreases amount owed to supplier
Owner debit/credit adjustment    -> changes balance explicitly
```

Balance may be:

- positive: business owes supplier;
- zero;
- negative: supplier has received/consumed more than currently earned.

Negative balance is VALID.

## Religious/business rule

There must be ZERO:

- interest;
- late fee;
- profit on debt/credit;
- compounding;
- time-based finance charge.

The ledger tracks principal only.

---

# 9. POS cash handling

A supplier may ask the girls for a small amount, e.g. 20 EGP.

POS can record the actual money given.

POS must NOT see balance first.

OWNER may write an instruction such as:

- "يمكن إعطاؤه حتى 500 جنيه"
- "لا تدفعوا له اليوم"
- "اسألوني قبل الدفع"

This is ADVISORY TEXT ONLY.

It is never a hard system limit.

If note says 500 and the girls actually give 700, the system MUST allow recording 700.

Each POS cash movement stores:

- supplier;
- positive amount in piasters;
- business date;
- shift;
- exact timestamp;
- source role = POS;
- optional POS note;
- OWNER review status.

Every POS cash movement must appear in an OWNER review queue.

---

# 10. Goods / advances / negotiated repayment

Supplier may receive goods instead of cash.

Example:

```text
Cheese taken: 150 EGP
Typical weekly earnings: 50 EGP
Negotiated deduction: 10 EGP each settlement/week until principal is cleared
```

Other possibilities:

- supplier asks for no cash for three weeks;
- owner pays more than supplier has earned, creating negative carry;
- supplier and owner negotiate how much to deduct now.

Do NOT build a complicated loan/installment engine.

Recommended:

- record real cash/goods movements as ledger movements;
- optional OWNER-only advisory repayment instruction:
  - suggested deduction amount;
  - optional hold-payment-until date;
  - free-text note;
- settlement screen may prefill these suggestions;
- OWNER can override;
- no automatic financial posting without explicit confirmation;
- no interest.

---

# 11. Settlement

OWNER may settle at any time.

Settlement should:

1. select supplier;
2. gather milk not already included in previous settlement;
3. resolve price by delivery date + milk type;
4. show cow/buffalo separately;
5. include relevant account movements;
6. show opening carry;
7. allow payment = 0 / partial / full / greater than current earned amount;
8. allow negotiated deduction;
9. calculate closing carry;
10. store immutable calculation snapshot;
11. provide a clean print-friendly receipt/history record.

Settlement does NOT require closing balance to become zero.

---

# 12. Explicit non-goals

Do NOT add:

- customer milk/rayeb sales;
- supplier photos;
- RFID/NFC;
- supplier-owned cards;
- supplier numeric IDs as human workflow;
- microservices;
- Redis;
- Kafka/message broker;
- AI/LLM/embedding recommendation service;
- payment gateway;
- general ERP;
- interest/loan logic;
- fancy movement/animations;
- dynamically reordered trie buttons.
