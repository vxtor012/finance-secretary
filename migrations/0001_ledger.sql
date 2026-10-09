PRAGMA foreign_keys = ON;
CREATE TABLE accounts (
 id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE,
 kind TEXT NOT NULL CHECK(kind IN ('cash','bank','credit','income','expense','equity','receivable','payable')),
 reconciled_at TEXT, credit_limit INTEGER CHECK(credit_limit IS NULL OR credit_limit > 0),
 statement_day INTEGER CHECK(statement_day BETWEEN 1 AND 28), due_day INTEGER CHECK(due_day BETWEEN 1 AND 28),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO accounts(id,name,kind) VALUES
 ('cash','tiền mặt','cash'),('sys-income','@thu','income'),('sys-expense','@chi','expense'),('sys-equity','@đối soát','equity');
CREATE TABLE transactions (
 id TEXT PRIMARY KEY, source_key TEXT NOT NULL UNIQUE,
 kind TEXT NOT NULL CHECK(kind IN ('income','expense','transfer','reconcile','borrow','lend','repay','collect','reverse')),
 amount INTEGER NOT NULL CHECK(typeof(amount)='integer' AND amount > 0 AND amount <= 1000000000000),
 category TEXT NOT NULL, note TEXT NOT NULL, occurred_at TEXT NOT NULL,
 reversal_of TEXT UNIQUE REFERENCES transactions(id), sealed INTEGER NOT NULL DEFAULT 0 CHECK(sealed IN (0,1)),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE postings (
 tx_id TEXT NOT NULL REFERENCES transactions(id), account_id TEXT NOT NULL REFERENCES accounts(id),
 amount INTEGER NOT NULL CHECK(typeof(amount)='integer' AND amount != 0), PRIMARY KEY(tx_id,account_id)
);
CREATE INDEX postings_account ON postings(account_id,tx_id);
CREATE INDEX tx_period ON transactions(sealed,occurred_at,kind);
CREATE VIEW balances AS SELECT a.*,coalesce(sum(CASE WHEN t.sealed=1 THEN p.amount ELSE 0 END),0) AS balance
 FROM accounts a LEFT JOIN postings p ON p.account_id=a.id LEFT JOIN transactions t ON t.id=p.tx_id GROUP BY a.id;
CREATE TABLE debts (
 id TEXT PRIMARY KEY, account_id TEXT NOT NULL UNIQUE REFERENCES accounts(id),
 direction TEXT NOT NULL CHECK(direction IN ('borrow','lend')), person TEXT NOT NULL,
 principal INTEGER NOT NULL CHECK(principal > 0), remaining INTEGER NOT NULL CHECK(remaining BETWEEN 0 AND principal),
 due_date TEXT, created_at TEXT NOT NULL
);
CREATE TABLE debt_events (
 tx_id TEXT PRIMARY KEY REFERENCES transactions(id), debt_id TEXT NOT NULL REFERENCES debts(id),
 amount INTEGER NOT NULL CHECK(amount > 0), event TEXT NOT NULL CHECK(event IN ('open','payment'))
);
CREATE TRIGGER debt_payment BEFORE INSERT ON debt_events WHEN NEW.event='payment' BEGIN SELECT (CASE WHEN NEW.amount > (SELECT remaining FROM debts WHERE id=NEW.debt_id) THEN RAISE(ABORT,'OVERPAYMENT') END); END;
CREATE TRIGGER debt_reduce AFTER INSERT ON debt_events WHEN NEW.event='payment' BEGIN UPDATE debts SET remaining=remaining-NEW.amount WHERE id=NEW.debt_id; END;
CREATE TRIGGER postings_insert BEFORE INSERT ON postings BEGIN SELECT (CASE WHEN (SELECT sealed FROM transactions WHERE id=NEW.tx_id)=1 THEN RAISE(ABORT,'IMMUTABLE') END); END;
CREATE TRIGGER postings_update BEFORE UPDATE ON postings BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
CREATE TRIGGER postings_delete BEFORE DELETE ON postings BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
CREATE TRIGGER tx_update BEFORE UPDATE ON transactions WHEN OLD.sealed=1 BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
CREATE TRIGGER tx_delete BEFORE DELETE ON transactions BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
CREATE TRIGGER seal_tx BEFORE UPDATE OF sealed ON transactions WHEN NEW.sealed=1 AND OLD.sealed=0 BEGIN SELECT (CASE WHEN EXISTS(SELECT 1 FROM postings p JOIN balances a ON a.id=p.account_id WHERE p.tx_id=NEW.id AND abs(a.balance+p.amount)>1000000000000) THEN RAISE(ABORT,'BALANCE_LIMIT') END); SELECT (CASE WHEN (SELECT count(*) FROM postings WHERE tx_id=NEW.id)!=2 OR (SELECT coalesce(sum(amount),1) FROM postings WHERE tx_id=NEW.id)!=0 OR (SELECT max(abs(amount)) FROM postings WHERE tx_id=NEW.id)!=NEW.amount THEN RAISE(ABORT,'UNBALANCED') END); SELECT (CASE WHEN EXISTS(SELECT 1 FROM postings p JOIN balances a ON a.id=p.account_id WHERE p.tx_id=NEW.id AND a.kind='credit' AND (a.balance+p.amount>0 OR (a.credit_limit IS NOT NULL AND a.balance+p.amount < -a.credit_limit))) THEN RAISE(ABORT,'CREDIT_LIMIT') END); END;
CREATE TABLE audit (
 id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, entity_id TEXT NOT NULL,
 detail TEXT NOT NULL, at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TRIGGER audit_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
CREATE TRIGGER audit_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
CREATE TRIGGER debt_event_update BEFORE UPDATE ON debt_events BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
CREATE TRIGGER debt_event_delete BEFORE DELETE ON debt_events BEGIN SELECT RAISE(ABORT,'IMMUTABLE'); END;
CREATE TABLE drafts (
 id TEXT PRIMARY KEY, payload TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','applied','cancelled')),
 expires_at TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE inbox (
 id INTEGER PRIMARY KEY, payload TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending',
 lease_until TEXT, attempts INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE INDEX inbox_pending ON inbox(state,lease_until);
CREATE TABLE request_usage(day TEXT PRIMARY KEY, requests INTEGER NOT NULL CHECK(requests BETWEEN 0 AND 500));
CREATE TRIGGER inbox_quota AFTER INSERT ON inbox BEGIN INSERT INTO request_usage(day,requests) VALUES(substr(NEW.created_at,1,10),1) ON CONFLICT(day) DO UPDATE SET requests=requests+1; END;
CREATE TABLE outbox (
 id TEXT PRIMARY KEY, method TEXT NOT NULL, payload TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending',
 attempts INTEGER NOT NULL DEFAULT 0, lease_until TEXT, created_at TEXT NOT NULL
);
CREATE INDEX outbox_pending ON outbox(state,lease_until);
CREATE TABLE recurring (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>0), account_id TEXT NOT NULL REFERENCES accounts(id),
 category TEXT NOT NULL, day INTEGER NOT NULL CHECK(day BETWEEN 1 AND 28), active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);
CREATE TABLE recurring_occurrences (
 id TEXT PRIMARY KEY, recurring_id TEXT NOT NULL REFERENCES recurring(id), due_date TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'due' CHECK(state IN ('due','paid','skipped')), tx_id TEXT UNIQUE REFERENCES transactions(id)
);
CREATE TABLE credit_statements (
 id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), closed_at TEXT NOT NULL,
 due_date TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>=0)
);
CREATE TABLE ai_usage (day TEXT PRIMARY KEY, calls INTEGER NOT NULL DEFAULT 0);
CREATE TABLE guards (id TEXT PRIMARY KEY, ok INTEGER NOT NULL CHECK(ok=1));
