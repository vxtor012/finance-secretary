---
name: telegram-worker
description: Maintain this Telegram Worker's webhook authentication, AI adapters, durable jobs, scheduled reminders and delivery behavior.
---

Read `src/worker.js`, `src/bot.js`, `src/scheduler.js` and `docs/OPERATIONS.md` for the path being changed. Authenticate before parsing the body; limit streaming body bytes; owner/private chat checks cover callbacks. Persist inbox before HTTP acknowledgement. Financial idempotency is enforced by SQL independently of Telegram delivery.

Keep provider URLs fixed. Models and keys are configured, AI is disabled by default, rule parsing comes first. Reserve quota atomically before a request; bound attempts/timeouts and validate JSON. Provider instructions cannot authorize transactions. Chart PNGs are rendered inside the Worker, without third-party URLs.

Test retries after a committed ledger mutation, malformed updates, unknown users, callback replay, provider timeout/invalid JSON and local UTC+7 period boundaries. Telegram messages have at-least-once delivery: a crash after send may duplicate a notification, but cannot duplicate the ledger. Keep that limitation explicit.

Use dry-run build and local D1 for validation. A webhook-registration script performs an external write and needs explicit human authorization, even if a test credential file exists.
