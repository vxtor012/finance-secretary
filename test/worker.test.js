import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import {database,environment,update} from './d1.js';
import {first,stmt,rows} from '../src/db.js';
import {handleUpdate,processInbox,authorized} from '../src/bot.js';
import {parseAI,provider} from '../src/ai.js';
import {flushOutbox,snapshot} from '../src/telegram.js';
import {schedule} from '../src/scheduler.js';
import {verify} from '../scripts/backup.js';
import {barPNG} from '../src/chart.js';
import {inflateSync} from 'node:zlib';
const now='2026-10-09T05:00:00.000Z';
test('webhook denies secrets, wrong users/groups and malformed/oversized bodies',async()=>{
  const db=database(),env=environment(db),ctx={waitUntil(){}};
  const request=(body,secret=env.TELEGRAM_WEBHOOK_SECRET)=>new Request('https://test/telegram',{method:'POST',headers:{'X-Telegram-Bot-Api-Secret-Token':secret},body});
  assert.equal((await worker.fetch(request('{}','bad'),env,ctx)).status,401);
  assert.equal((await worker.fetch(request('null'),env,ctx)).status,400);
  assert.equal((await worker.fetch(request('x'.repeat(17000)),env,ctx)).status,400);
  const stranger=update(1,'chi 50k ăn');stranger.message.from.id=999;
  assert.equal((await worker.fetch(request(JSON.stringify(stranger)),env,ctx)).status,200);
  assert.equal((await first(db,'SELECT count(*) AS n FROM inbox')).n,0);
  const group=update(2,'chi 50k ăn');group.message.chat.type='group';assert.equal(authorized(group,'123'),false);
  assert.equal((await worker.fetch(request('{}'),environment(db,{OWNER_TELEGRAM_ID:''}),ctx)).status,503);
  db.close();
});
test('inbox replay and callback replay do not duplicate journal; cancelling a draft prevents writes',async()=>{
  const db=database(),env=environment(db);
  await stmt(db,'INSERT INTO inbox(id,payload,created_at) VALUES(?,?,?)',10,JSON.stringify(update(10,'chi 50k ăn trưa')),now).run();
  await processInbox(env,now);assert.equal((await first(db,'SELECT count(*) AS n FROM transactions')).n,0);
  const cb=id=>({update_id:id,callback_query:{id:'cb'+id,from:{id:123},message:{chat:{id:123,type:'private'}},data:'ok:d-10'}});
  await handleUpdate(env,cb(11),now);await handleUpdate(env,cb(12),now);
  assert.equal((await first(db,'SELECT count(*) AS n FROM transactions')).n,1);
  await handleUpdate(env,update(20,'chi 10k cafe'),now);
  const cancel=cb(21);cancel.callback_query.data='no:d-20';await handleUpdate(env,cancel,now);
  const cancelled=cb(22);cancelled.callback_query.data='ok:d-20';await handleUpdate(env,cancelled,now);
  assert.equal((await first(db,'SELECT count(*) AS n FROM transactions')).n,1);db.close();
});
test('all user flows run through Telegram handlers, including manual reports and recurring payment',async()=>{
  const db=database(),env=environment(db);
  await handleUpdate(env,update(1,'/taikhoan | ngân hàng | bank'),now);
  await handleUpdate(env,update(2,'/laplai | thuê trọ | 3tr | ngân hàng | nhà ở | 9'),now);
  await schedule(env,now);await schedule(env,now);
  assert.equal((await first(db,'SELECT count(*) AS n FROM recurring_occurrences')).n,1);
  await handleUpdate(env,update(3,'/tralap | rec-2:2026-10-09'),now);
  await handleUpdate(env,update(4,'/tralap | rec-2:2026-10-09'),now);
  for(const id of [3,4]) await handleUpdate(env,{update_id:10+id,callback_query:{id:'cb'+id,from:{id:123},message:{chat:{id:123,type:'private'}},data:'ok:d-'+id}},now);
  assert.equal((await first(db,'SELECT count(*) AS n FROM transactions')).n,1);
  assert.equal((await first(db,"SELECT state FROM recurring_occurrences WHERE id='rec-2:2026-10-09'")).state,'paid');
  await handleUpdate(env,update(20,'/baocao tháng'),now);
  assert.equal((await first(db,"SELECT count(*) AS n FROM outbox WHERE id LIKE 'manual:20:%'")).n,2);db.close();
});
test('AI fallback rejects malformed answers and uses atomic budget, without logging raw data',async()=>{
  const db=database(),env=environment(db,{AI_ENABLED:'true',AI_ORDER:'groq,openrouter',AI_DAILY_LIMIT:'2',GROQ_API_KEY:'test',GROQ_MODEL:'test',OPENROUTER_API_KEY:'test',OPENROUTER_MODEL:'test'});
  let calls=0;
  const mock=async()=>{calls++;return Response.json({choices:[{message:{content:calls===1?'bad':JSON.stringify({kind:'expense',amount:50000,account:'tiền mặt',category:'ăn',note:'trưa'})}}]});};
  assert.equal((await parseAI(env,'ăn trưa hết 50k',now,mock)).amount,50000);
  assert.equal(await parseAI(env,'cafe',now,mock),null);assert.equal(calls,2);
  assert.equal((await first(db,'SELECT calls FROM ai_usage')).calls,2);
  assert.equal(await parseAI(environment(db),'x',now,mock),null);db.close();
});
test('Gemma/Gemini and Workers AI adapters use configured models and normalize response',async()=>{
  const env={GEMMA_API_KEY:'x',GEMMA_MODEL:'gemma-test',GEMINI_API_KEY:'x',GEMINI_MODEL:'gemini-test',CLOUDFLARE_AI_MODEL:'@cf/test',AI:{async run(model){assert.equal(model,'@cf/test');return {response:'{}'};}}};
  for(const name of ['gemma','gemini'])assert.equal(await provider(name,env,'x',async(url,init)=>{assert.ok(url.includes(name+'-test'));assert.equal(init.headers['x-goog-api-key'],'x');return Response.json({candidates:[{content:{parts:[{text:'{}'}]}}]});}),'{}');
  assert.equal(await provider('cloudflare',env,'x'),'{}');
});
test('outbox retries failures, keeps ledger untouched and records sent state',async()=>{
  const db=database(),env=environment(db);await handleUpdate(env,update(1,'/start'),now);
  await flushOutbox(env,now,async()=>Response.json({ok:false}));
  const failed=await first(db,'SELECT * FROM outbox');assert.equal(failed.attempts,1);assert.equal(failed.state,'sending');
  let sends=0;await flushOutbox(env,'2026-10-09T06:00:00.000Z',async()=>{sends++;return Response.json({ok:true,result:{}});});
  assert.equal(sends,1);assert.equal((await first(db,'SELECT state FROM outbox')).state,'sent');db.close();
});
test('scheduled weekly/monthly/yearly reports are idempotent at UTC+7 boundaries',async()=>{
  const db=database(),env=environment(db),time='2027-01-01T01:00:00.000Z';
  await schedule(env,time);await schedule(env,time);
  assert.equal((await first(db,"SELECT count(*) AS n FROM outbox WHERE id LIKE 'monthly:%' OR id LIKE 'yearly:%'")).n,4);
  await schedule(env,'2027-01-04T01:00:00.000Z');await schedule(env,'2027-01-04T02:00:00.000Z');
  assert.equal((await first(db,"SELECT count(*) AS n FROM outbox WHERE id LIKE 'weekly:%'")).n,2);
  assert.equal((await first(db,"SELECT count(*) AS n FROM outbox WHERE method='backup'")).n,1);db.close();
});
test('credit statement closing balance excludes purchases after close and handles reversal of repayment',async()=>{
  const db=database(),env=environment(db);
  await handleUpdate(env,update(1,'/the | visa | 10tr | 10 | 25'),now);
  async function post(id,text,time) {await handleUpdate(env,update(id,text),time);await handleUpdate(env,{update_id:id+100,callback_query:{id:'c'+id,from:{id:123},message:{chat:{id:123,type:'private'}},data:'ok:d-'+id}},time);}
  await post(2,'/chi | 1tr | visa | ăn uống | trước chốt','2026-10-10T05:00:00.000Z');
  await post(3,'/chi | 2tr | visa | mua sắm | sau chốt','2026-10-11T05:00:00.000Z');
  await schedule(env,'2026-10-22T01:00:00.000Z');assert.equal((await first(db,"SELECT amount FROM credit_statements WHERE id='acc-1:2026-10-10'")).amount,1000000);
  await post(4,'/chuyen | 400k | tiền mặt | visa | trả thẻ','2026-10-22T02:00:00.000Z');
  await post(5,'/huy | tx-d-4','2026-10-22T03:00:00.000Z');
  await schedule(env,'2026-10-23T01:00:00.000Z');
  const msg=await first(db,"SELECT payload FROM outbox WHERE id='card:acc-1:2026-10-10:2026-10-23'");assert.ok(JSON.parse(msg.payload).text.includes('1.000.000'));db.close();
});
test('JSON backup restores complete ledger and rejects corrupted debt amounts',async()=>{
  const db=database(),env=environment(db);
  for(const [id,text] of [[1,'/vay | 1tr | An | tiền mặt | -'],[2,'/trano | debt-d-1 | 300k | tiền mặt']]) {
    await handleUpdate(env,update(id,text),now);await handleUpdate(env,{update_id:id+100,callback_query:{id:'c'+id,from:{id:123},message:{chat:{id:123,type:'private'}},data:'ok:d-'+id}},now);
  }
  const data=await snapshot(db,now);assert.equal(verify(data).transactions,2);
  data.tables.debts[0].remaining=900000;assert.throws(()=>verify(data),/mismatch/);db.close();
});
test('PNG chart is valid, decompresses and does not use remote rendering',async()=>{
  const bytes=await barPNG([500000,200000]);assert.deepEqual([...bytes.slice(0,8)],[137,80,78,71,13,10,26,10]);
  let off=8;const compressed=[];while(off<bytes.length){const v=new DataView(bytes.buffer,bytes.byteOffset+off);const len=v.getUint32(0);const type=new TextDecoder().decode(bytes.slice(off+4,off+8));if(type==='IDAT')compressed.push(bytes.slice(off+8,off+8+len));off+=len+12;}
  assert.equal(inflateSync(Buffer.concat(compressed)).length,180*(360*3+1));
});
test('webhook daily limit is atomic and duplicate update consumes no quota',async()=>{
  const db=database();db.sql.exec("INSERT INTO request_usage(day,requests) VALUES('2026-10-09',499)");
  await stmt(db,'INSERT OR IGNORE INTO inbox(id,payload,created_at) VALUES(?,?,?)',1,'{}',now).run();
  await stmt(db,'INSERT OR IGNORE INTO inbox(id,payload,created_at) VALUES(?,?,?)',1,'{}',now).run();
  await assert.rejects(()=>stmt(db,'INSERT INTO inbox(id,payload,created_at) VALUES(?,?,?)',2,'{}',now).run(),/CHECK/);
  assert.equal((await first(db,'SELECT count(*) AS n FROM inbox')).n,1);assert.equal((await first(db,'SELECT requests FROM request_usage')).requests,500);db.close();
});
test('expired final-attempt leases become visible failed jobs after process crash',async()=>{
  const db=database(),env=environment(db);
  db.sql.exec("INSERT INTO inbox(id,payload,state,lease_until,attempts,created_at) VALUES(1,'{}','processing','2026-10-09T04:00:00Z',5,'2026-10-09T04:00:00Z')");
  db.sql.exec("INSERT INTO outbox(id,method,payload,state,lease_until,attempts,created_at) VALUES('x','sendMessage','{}','sending','2026-10-09T04:00:00Z',8,'2026-10-09T04:00:00Z')");
  await processInbox(env,now);await flushOutbox(env,now,async()=>{throw new Error('must not send');});
  assert.equal((await first(db,'SELECT state FROM inbox')).state,'failed');assert.equal((await first(db,'SELECT state FROM outbox')).state,'failed');db.close();
});
test('recurring catch-up preserves missed months and respects registration date',async()=>{
  const db=database(),env=environment(db);
  await handleUpdate(env,update(1,'/laplai | thuê | 3tr | tiền mặt | nhà ở | 5'),now);
  await schedule(env,now);assert.equal((await first(db,'SELECT count(*) AS n FROM recurring_occurrences')).n,0);
  await schedule(env,'2027-02-09T01:00:00.000Z');
  const ds=await rows(db,'SELECT due_date FROM recurring_occurrences ORDER BY due_date');
  assert.deepEqual(ds.map(d=>d.due_date),['2026-11-05','2026-12-05','2027-01-05','2027-02-05']);db.close();
});
