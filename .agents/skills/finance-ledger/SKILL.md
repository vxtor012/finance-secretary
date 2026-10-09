---
name: finance-ledger
description: Implement or review ledger, debt, reconciliation, credit and report changes in this personal Vietnamese finance bot.
---

Read `docs/PRD.md`, `src/ledger.js` and the relevant SQL triggers first. Income/expense use system counterpart accounts; transfers and debt payments bypass them. Credit debt is a negative balance. Receivables are positive; payables negative; the debt table's remaining amount must match its ledger account.

Design race-sensitive checks inside the same D1 batch as postings. Two simultaneous partial repayments must never overpay. A stale reconciliation must fail rather than overwrite later activity. Duplicate confirmation must append nothing. Use integer amounts, strict date/amount parsing and additive corrections.

Verify affected invariants through `test/ledger.test.js` and the D1 runtime test. Reporting tests should assert amounts after transfers, debt payments and reversals, rather than only matching output strings. Update backup restoration whenever a permanent table changes. Check a real export can be restored into an empty local database with the original balances and audit.
