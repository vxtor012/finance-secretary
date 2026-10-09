import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {environment,update} from '../test/d1.js';
import {snapshot} from '../src/telegram.js';
import {verify} from './backup.js';
import {unstable_splitSqlQuery} from 'wrangler';
const {DB,...bindings}=environment(null);
const mf=new Miniflare(convertV4MiniflareOptions({workers:[
  {name:'finance',modules:true,scriptPath:resolve('build/worker.js'),compatibilityDate:'2026-10-01',d1Databases:{DB:'finance-local',RESTORE:'finance-restore'},bindings,outboundService:'telegram-mock'},
  {name:'telegram-mock',modules:true,script:`export default {async fetch(request){return Response.json({ok:true,result:{message_id:1}})}}`}
]}));
try {
  const db=await mf.getD1Database('DB','finance'),schema=readFileSync('migrations/0001_ledger.sql','utf8');
  async function executeSQL(target,sql) {
    // Match the installed Wrangler's SQL splitting instead of a custom loader.
    await target.batch(unstable_splitSqlQuery(sql).map(query=>target.prepare(query)));
  }
  await executeSQL(db,schema);
  const send=async payload=>{
    const r=await mf.dispatchFetch('https://test/telegram',{method:'POST',headers:{'X-Telegram-Bot-Api-Secret-Token':bindings.TELEGRAM_WEBHOOK_SECRET},body:JSON.stringify(payload)});assert.equal(r.status,200);
  };
  async function until(sql,expected) {
    for(let i=0;i<100;i++){const r=await db.prepare(sql).first();if(r.n===expected)return;await new Promise(r=>setTimeout(r,30));}throw new Error('D1 job did not complete: '+sql);
  }
  await send(update(1,'chi 50k ăn trưa'));await until('SELECT count(*) AS n FROM drafts',1);
  const cb=id=>({update_id:id,callback_query:{id:'c'+id,from:{id:123},message:{chat:{id:123,type:'private'}},data:'ok:d-1'}});
  await send(cb(2));await until('SELECT count(*) AS n FROM transactions WHERE sealed=1',1);
  await send(cb(3));await until("SELECT count(*) AS n FROM inbox WHERE state='done'",3);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM transactions').first()).n,1);
  assert.equal((await db.prepare("SELECT balance FROM balances WHERE id='cash'").first()).balance,-50000);
  await send(update(4,'/the | visa | 1tr | 10 | 25'));await until("SELECT count(*) AS n FROM accounts WHERE kind='credit'",1);
  await send(update(5,'/chi | 2tr | visa | mua sắm | vượt hạn'));await until('SELECT count(*) AS n FROM drafts',2);
  const over=cb(6);over.callback_query.data='ok:d-5';await send(over);await until("SELECT count(*) AS n FROM inbox WHERE state='done'",6);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM transactions').first()).n,1);
  assert.equal((await db.prepare("SELECT balance FROM balances WHERE name='visa'").first()).balance,0);
  const backup=await snapshot(db,new Date().toISOString()),restored=await mf.getD1Database('RESTORE','finance');
  await executeSQL(restored,verify(backup).sql);
  assert.equal((await restored.prepare("SELECT balance FROM balances WHERE id='cash'").first()).balance,-50000);
  assert.equal((await restored.prepare('SELECT name FROM d1_migrations').first()).name,'0001_ledger.sql');
  console.log('PASS: real local Workers/D1 runtime, webhook, atomic confirm, duplicate replay, credit rollback and JSON-to-D1 restore. Network is routed to a local Telegram mock.');
} finally {await mf.dispose();}
