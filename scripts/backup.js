import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
const tables=['accounts','transactions','postings','debts','debt_events','audit','recurring','recurring_occurrences','credit_statements'];
function literal(x) {
  if(x===null) return 'NULL';if(typeof x==='number'&&Number.isSafeInteger(x)) return String(x);
  if(typeof x==='string') return "'"+x.replace(/'/g,"''")+"'";throw new Error('Unsupported backup value');
}
export function restorationSQL(data) {
  if(data?.schemaVersion!==1||!data.tables||tables.some(t=>!Array.isArray(data.tables[t])))throw new Error('Unsupported or incomplete backup schema');
  const schema=readFileSync(new URL('../migrations/0001_ledger.sql',import.meta.url),'utf8');
  const pieces=[schema,'DELETE FROM accounts;'];
  const insert=(table,row)=>{
    const columns=Object.keys(row);if(columns.some(c=>!/^\w+$/.test(c)))throw new Error('Invalid column');
    pieces.push(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map(c=>literal(row[c])).join(',')});`);
  };
  for(const r of data.tables.accounts)insert('accounts',r);
  for(const r of data.tables.transactions){if(r.sealed!==1)throw new Error('Unsealed transaction in backup');insert('transactions',{...r,sealed:0});}
  for(const r of data.tables.debts)insert('debts',{...r,remaining:r.principal});
  for(const r of data.tables.postings)insert('postings',r);
  for(const r of data.tables.debt_events)insert('debt_events',r);
  for(const r of data.tables.transactions)pieces.push(`UPDATE transactions SET sealed=1 WHERE id=${literal(r.id)};`);
  for(const t of ['audit','recurring','recurring_occurrences','credit_statements'])for(const r of data.tables[t])insert(t,r);
  // Baseline the migration included in this self-contained restore for Wrangler.
  pieces.push('CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT UNIQUE,applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL);');
  pieces.push("INSERT INTO d1_migrations(name) VALUES('0001_ledger.sql');");
  return pieces.join('\n');
}
export function verify(data) {
  const sql=restorationSQL(data),db=new DatabaseSync(':memory:');
  try {
    db.exec(sql);
    if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('Database integrity check failed');
    const bad=db.prepare(`SELECT d.id FROM debts d JOIN balances b ON b.id=d.account_id WHERE b.balance!=CASE WHEN d.direction='lend' THEN d.remaining ELSE -d.remaining END`).all();
    if(bad.length)throw new Error('Debt ledger mismatch');
    for(const t of tables){
      const actual=db.prepare('SELECT * FROM '+t).all().map(r=>JSON.stringify({...r})).sort();
      const expected=data.tables[t].map(r=>JSON.stringify(r)).sort();
      if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error('Restored table mismatch: '+t);
    }
    return {sql,transactions:data.tables.transactions.length,accounts:data.tables.accounts.length};
  } finally {db.close();}
}
