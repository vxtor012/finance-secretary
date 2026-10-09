import {localDate,addDays,nextMonth,amount} from './domain.js';
import {stmt,rows,first,enqueue} from './db.js';
import {enqueueReport} from './reports.js';
export async function schedule(env,now) {
  const db=env.DB,chat=env.OWNER_TELEGRAM_ID,{date,hour}=localDate(now,env.TIMEZONE||'Asia/Ho_Chi_Minh');
  // Idempotent daily reminders; avoid midnight noise. Catch up later in the same day.
  if(hour<8) return;
  const recs=await rows(db,'SELECT * FROM recurring WHERE active=1');
  for(const r of recs) {
    const last=await first(db,'SELECT max(due_date) AS due FROM recurring_occurrences WHERE recurring_id=?',r.id);
    const created=localDate(r.created_at,env.TIMEZONE).date;
    let due=last?.due?nextMonth(last.due,r.day):created.slice(0,7)+'-'+String(r.day).padStart(2,'0');
    if(due<created)due=nextMonth(due,r.day);
    // Bounded catch-up after downtime, continuing next cron if >12 months missed.
    for(let i=0;i<12&&due<=addDays(date,3);i++,due=nextMonth(due,r.day)) await stmt(db,'INSERT OR IGNORE INTO recurring_occurrences(id,recurring_id,due_date) VALUES(?,?,?)',r.id+':'+due,r.id,due).run();
  }
  const occs=await rows(db,"SELECT o.*,r.name,r.amount FROM recurring_occurrences o JOIN recurring r ON r.id=o.recurring_id WHERE o.state='due' AND o.due_date<=? ORDER BY o.due_date LIMIT 20",addDays(date,3));
  for(const o of occs) await enqueue(db,`reminder:${o.id}:${date}`,'sendMessage',{chat_id:chat,text:`Nhắc ${o.name}: ${amount(o.amount)}, hạn ${o.due_date}.\n/tralap | ${o.id}\n/bolap | ${o.id}`},now).run();
  const debts=await rows(db,'SELECT * FROM debts WHERE remaining>0 AND due_date IS NOT NULL AND due_date<=? ORDER BY due_date LIMIT 20',addDays(date,3));
  for(const d of debts) await enqueue(db,`debt:${d.id}:${date}`,'sendMessage',{chat_id:chat,text:`${d.direction==='borrow'?'Nợ phải trả':'Nợ phải thu'} ${d.person}: ${amount(d.remaining)} • hạn ${d.due_date}\nMã ${d.id}`},now).run();
  const cards=await rows(db,"SELECT * FROM accounts WHERE kind='credit'");
  for(const a of cards) {
    let closed=date.slice(0,7)+'-'+String(a.statement_day).padStart(2,'0');
    if(addDays(closed,1)>date) {const d=new Date(closed+'T00:00:00Z');d.setUTCMonth(d.getUTCMonth()-1);closed=d.toISOString().slice(0,10);}
    const cutoff=new Date(addDays(closed,1)+'T00:00:00+07:00').toISOString(),id=a.id+':'+closed;
    let due=closed.slice(0,7)+'-'+String(a.due_day).padStart(2,'0');if(a.due_day<=a.statement_day)due=nextMonth(due,a.due_day);
    // Historical closing balance, not today's balance; no credit interest engine.
    await stmt(db,`INSERT OR IGNORE INTO credit_statements(id,account_id,closed_at,due_date,amount) SELECT ?,?,?,?,max(0,-coalesce(sum(p.amount),0)) FROM postings p JOIN transactions t ON t.id=p.tx_id WHERE p.account_id=? AND t.sealed=1 AND t.occurred_at<?`,id,a.id,cutoff,due,a.id,cutoff).run();
    const bills=await rows(db,`SELECT s.*,max(0,s.amount-coalesce((SELECT sum(p.amount) FROM postings p JOIN transactions t ON t.id=p.tx_id LEFT JOIN transactions original ON original.id=t.reversal_of WHERE p.account_id=s.account_id AND (t.kind='transfer' OR (t.kind='reverse' AND (original.kind='transfer' OR p.amount>0))) AND t.sealed=1 AND t.occurred_at>=s.closed_at),0)) AS unpaid FROM credit_statements s WHERE s.account_id=? AND s.due_date<=? ORDER BY s.closed_at DESC LIMIT 1`,a.id,addDays(date,3));
    for(const b of bills)if(b.unpaid>0) await enqueue(db,`card:${b.id}:${date}`,'sendMessage',{chat_id:chat,text:`Thẻ ${a.name}: số dư chốt kỳ còn cần trả ${amount(b.unpaid)}, hạn ${b.due_date}.\n/chuyen | số tiền | ngân hàng | ${a.name} | trả thẻ\nSố dư chốt bao gồm nợ kỳ trước; không cộng các sao kê với nhau. Đối chiếu sao kê ngân hàng để biết phí/lãi.`},now).run();
  }
  const weekday=new Date(date+'T00:00:00Z').getUTCDay();
  if(weekday===1) {
    if(!await first(db,'SELECT id FROM outbox WHERE id=?','weekly:'+date+':text')) await enqueueReport(db,'weekly:'+date,chat,'week',now,env.TIMEZONE,true);
    if(env.AUTO_BACKUP==='true') await enqueue(db,'backup:'+date,'backup',{chat_id:chat,at:now},now).run();
  }
  if(date.endsWith('-01')&&!await first(db,'SELECT id FROM outbox WHERE id=?','monthly:'+date+':text')) await enqueueReport(db,'monthly:'+date,chat,'month',now,env.TIMEZONE,true);
  if(date.endsWith('-01-01')&&!await first(db,'SELECT id FROM outbox WHERE id=?','yearly:'+date+':text')) await enqueueReport(db,'yearly:'+date,chat,'year',now,env.TIMEZONE,true);
  // Retain permanent financial/audit records; operational bodies have short retention.
  const cutoff=new Date(Date.parse(now)-30*86400000).toISOString();
  await db.batch([
    stmt(db,"DELETE FROM inbox WHERE state='done' AND created_at<?",cutoff),
    stmt(db,"DELETE FROM outbox WHERE state='sent' AND created_at<?",cutoff),
    stmt(db,"DELETE FROM drafts WHERE state!='pending' AND created_at<?",cutoff),
    stmt(db,"UPDATE drafts SET state='cancelled' WHERE state='pending' AND expires_at<?",now)
  ]);
}
