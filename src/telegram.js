import {first,stmt} from './db.js';
import {barPNG} from './chart.js';
const TABLES=['accounts','transactions','postings','debts','debt_events','audit','recurring','recurring_occurrences','credit_statements'];
export const escapeHTML=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
export async function snapshot(db,now) {
  const result={schemaVersion:1,exportedAt:now,tables:{}};
  // A D1 batch reads all tables within one consistent transaction.
  const batches=await db.batch(TABLES.map(t=>db.prepare('SELECT * FROM '+t)));
  TABLES.forEach((t,i)=>{result.tables[t]=batches[i].results;});return result;
}
export async function callTelegram(env,method,payload,fetcher=fetch) {
  let body,headers;
  if(method==='chart') {
    body=new FormData();body.set('chat_id',String(payload.chat_id));body.set('caption',payload.caption);
    body.set('photo',new Blob([await barPNG(payload.values)],{type:'image/png'}),'thu-chi.png');method='sendPhoto';
  } else if(method==='backup') {
    const at=new Date().toISOString(),data=await snapshot(env.DB,at);body=new FormData();body.set('chat_id',String(payload.chat_id));body.set('caption','Sao lưu sổ cái JSON • chứa dữ liệu riêng tư; lưu ở nơi an toàn.');
    body.set('document',new Blob([JSON.stringify(data)],{type:'application/json'}),`finance-${at.slice(0,10)}.json`);method='sendDocument';
  } else if(method==='csv') {
    const {results}=await env.DB.prepare("SELECT t.id,t.kind,t.amount,t.category,t.note,t.occurred_at FROM transactions t WHERE sealed=1 ORDER BY occurred_at").all();
    const cell=v=>'"'+String(v).replace(/^[=+\-@]/,"'$&").replace(/"/g,'""')+'"';
    const csv='\ufeffid,loại,số tiền,nhóm,ghi chú,thời gian\r\n'+results.map(r=>Object.values(r).map(cell).join(',')).join('\r\n');
    body=new FormData();body.set('chat_id',String(payload.chat_id));body.set('document',new Blob([csv],{type:'text/csv;charset=utf-8'}),'ledger.csv');method='sendDocument';
  } else {body=JSON.stringify(payload);headers={'Content-Type':'application/json'};}
  const res=await fetcher(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,{method:'POST',headers,body,signal:AbortSignal.timeout(6000)});
  const data=await res.json();
  if(!res.ok||!data.ok) throw new Error('TELEGRAM_FAILURE');
  return data.result;
}
export async function flushOutbox(env,now,fetcher=fetch,maxJobs=8) {
  await stmt(env.DB,"UPDATE outbox SET state='failed' WHERE state='sending' AND attempts>=8 AND lease_until<?",now).run();
  for(let i=0;i<maxJobs;i++) {
    const lease=new Date(Date.parse(now)+60000).toISOString();
    const row=await stmt(env.DB,`UPDATE outbox SET state='sending',lease_until=?,attempts=attempts+1 WHERE id=(SELECT id FROM outbox WHERE (state='pending' OR (state='sending' AND lease_until<?)) AND attempts<8 ORDER BY created_at,id LIMIT 1) RETURNING *`,lease,now).first();
    if(!row) break;
    try {await callTelegram(env,row.method,JSON.parse(row.payload),fetcher);await stmt(env.DB,"UPDATE outbox SET state='sent',lease_until=NULL WHERE id=? AND lease_until=?",row.id,lease).run();}
    catch {await stmt(env.DB,"UPDATE outbox SET state=CASE WHEN attempts>=8 THEN 'failed' ELSE 'sending' END,lease_until=? WHERE id=? AND lease_until=?",new Date(Date.parse(now)+Math.min(3600,30*2**row.attempts)*1000).toISOString(),row.id,lease).run();}
  }
}
export async function failedJobs(db) {return first(db,"SELECT (SELECT count(*) FROM outbox WHERE state='failed') AS outbox,(SELECT count(*) FROM inbox WHERE state='failed') AS inbox");}
