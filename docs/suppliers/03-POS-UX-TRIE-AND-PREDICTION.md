# POS UX — Stable Trie + Top-3 Prediction

## 1. UX target

This is a dedicated village kitchen collection screen.

It must be:

- Arabic RTL;
- touch-first;
- huge;
- stable;
- fast;
- nearly zero typing;
- no hover dependency;
- no decorative animation;
- no auto-scrolling;
- no buttons changing position because of predictions;
- usable under pressure.

Use existing Dairy System MUI/design language.
Do not invent a second design system.

Prefer primary touch targets around 56–64 px where practical.

---

# 2. Main layout

Suggested structure:

```text
┌──────────────────────────────────────────────────────┐
│ صباحي / مسائي | التاريخ | حالة الحفظ/المزامنة      │
├──────────────────────────────────────────────────────┤
│ المتوقع الآن: [اسم 1] [اسم 2] [اسم 3]              │
├──────────────────────────────────────────────────────┤
│ اختيار المورد بالاسم - word-level trie              │
│                                                      │
│ [أحمد] [محمد] [علي] [عبد...] ...                    │
│                                                      │
├──────────────────────────────────────────────────────┤
│ آخر حركات الوردية: الوقت | المورد | الكمية | تعديل  │
└──────────────────────────────────────────────────────┘
```

Responsive layout may change columns/stacking, but deterministic control order must
remain.

---

# 3. Word-level trie

Primary supplier navigation is a TOKEN/WORD trie, not character typing.

Target supplier example:

```text
Abdo Ahmed Mohamed Tolba
```

Flow:

```text
[Abdo] [Ahmed] [Mohamed] ...
   ↓
prefix = Abdo

[Ahmed] [Hassan] [Ali] ...
   ↓
prefix = Abdo Ahmed

[Mohamed] [Mahmoud] ...
   ↓

if only one supplier remains:
select automatically
```

For Arabic:

- normalize internally;
- keep original display name visually;
- normalization should be conservative.

## Critical muscle-memory rule

Trie buttons MUST have stable deterministic ordering.

Prediction score MUST NEVER reorder trie buttons.

Use:

- owner-defined persistent order; or
- deterministic Arabic collation/sort key.

The core selector must look predictable every day.

---

# 4. Top-3 prediction strip

Separate from trie.

At most 3 supplier suggestions.

It may move/change because users understand it as "expected now".

Use simple interpretable local statistics, NOT ML.

Possible signals:

- current shift;
- current time bucket inside shift;
- supplier historical frequency in this shift;
- arrival-time history;
- recent attendance;
- optional weekday pattern.

Use smoothed counts and deterministic tie-breaking.

No:

- AI API;
- LLM;
- embeddings;
- training service;
- external recommender.

## Supplier already came in this shift

Normally strongly down-rank/exclude from recommendation after they are handled.

But supplier may bring BOTH cow and buffalo milk.

After first milk save:

- keep supplier selected;
- show a large direct option:
  `إضافة نوع اللبن الآخر لنفس المورد`
- then `انتهى`.

Only after leaving supplier workspace should normal current-shift suppression apply.

Trie must still allow exceptional manual selection again.

---

# 5. Supplier workspace

Show:

- huge supplier name;
- optional OWNER instruction to POS;
- NO balance;
- NO debt;
- NO historical money.

Then:

```text
[ لبن بقري ]
[ لبن جاموسي ]
```

Quantity UI should use satl/cup/quarters.

Example touch UI:

```text
السطل      [ - ]  2  [ + ]

الكوب      [ 0 ] [ 1 ] [ 2 ] [ 3 ] [ 4 ] [ 5 ]

الربع      [ 0 ] [ ¼ ] [ ½ ] [ ¾ ]

الكمية: 2 سطل و3 كوب و¼

[ حفظ ]
```

Routine use should NOT require decimal typing.

Persist exact integer units.

---

# 6. POS cash

Separate large action:

```text
[ صرف مبلغ للمورد ]
```

Show:

- supplier;
- OWNER instruction;
- large numeric keypad and/or common amount presets;
- optional short note;
- confirm.

Do NOT show balance.

Common buttons such as:

- 10
- 20
- 50
- 100 EGP

are acceptable if supplementary.

OWNER note is NEVER a technical hard limit.

---

# 7. Current-shift timeline

Always show recent current-shift events so workers know the action was recorded.

For milk:

- time;
- supplier;
- cow/buffalo;
- quantity;
- sync state;
- Edit;
- Delete.

For POS cash:

- time;
- supplier;
- amount;
- sync state.

No supplier balance.

Edit/delete only while shift OPEN.

Destructive action gets one simple confirmation.

---

# 8. Network status

Use calm, stable messages:

```text
متصل
محفوظ على الجهاز - بانتظار المزامنة
تمت المزامنة
```

Once the action is durably stored locally, UI should behave as successful.

Internet loss must NOT disable:

- milk add;
- milk edit;
- milk delete;
- POS cash;
- shift close.

---

# 9. Accessibility / visual stability

- RTL at root.
- large typography.
- strong visible focus.
- keyboard accessible although touch is primary.
- high contrast.
- no color-only meaning.
- no essential hover.
- no animated list reordering.
- no prediction-driven layout shift.
- respect reduced-motion.
- 200% zoom usable.
- no horizontal overflow on target tablet.

Aim for WCAG 2.2 AAA contrast where practical, but do not falsely claim formal
certification unless actually verified.
