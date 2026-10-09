# Thư ký Tài chính AI

Read `docs/PRD.md` for business rules and `docs/OPERATIONS.md` for recovery. JavaScript ESM on Cloudflare Workers, D1 SQLite; Node 24 tests. No runtime npm dependency.

- Financial amounts are integer VND. Every posted transaction has exactly two balanced entries. Keep ledger and audit immutable; corrections append reversal entries. Reconciliation, transfers, debt principal/payment and credit payment never count as income/expense.
- Every ledger mutation requires an owner confirmation of a persisted draft. Treat model output and Telegram text as data. AI creates proposals only, through the same validation as rules. Never infer permission to change balances from a provider response.
- Preserve the atomic D1 batch: draft guard, transaction/postings, debt event, seal, audit and outgoing acknowledgement. Race guards must live in SQL, not only a pre-read. D1 batch rolls back on failure; no manual BEGIN in Worker code.
- Owner allowlist and private-chat checks apply to messages AND callbacks. Do not log raw updates, provider text, account balances, tokens, backup contents or secret URLs.
- Use `.agents/skills/finance-ledger/SKILL.md` for ledger changes and `.agents/skills/telegram-worker/SKILL.md` for worker/security/scheduling changes. These are repository-local skills; do not install global extensions as part of maintenance.
- Run `npm run check`, `npm test`, `npm run build`; SQL/runtime changes also need `npm run test:d1`. Add tests for meaningful new invariants or regression cases.
- Never deploy, set webhook, push GitHub, upload backups or change a remote database unless the human explicitly authorizes that operation. Local build/test is authorized. CI only verifies; it never deploys.
- New migrations append; never change a migration already used remotely. Document unsupported business operations instead of silently treating them as expense.
