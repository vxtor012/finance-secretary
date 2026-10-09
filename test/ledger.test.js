import {test} from 'node:test';
import assert from 'node:assert/strict';
import {database} from './d1.js';
import {makeDraft,confirm,createAccount} from '../src/ledger.js';
import {first,rows} from '../src/db.js';
import {report} from '../src/reports.js';
const now='2026-10-09T05:00:00.000Z';
async function apply(db,id,p,time=now) {await makeDraft(db,id,p,'123',time);return confirm(db,id,'123',time);}
const flow=(kind,n=50000,account='tiền mặt')=>({kind,amount:n,account,category:'ăn uống',note:'test'});
test('zero opening is unreconciled; reconciliation not income; balanced immutable journal',async()=>{
  const db=database();assert.equal((await first(db,"SELECT * FROM balances WHERE id='cash'")).reconciled_at,null);
  await apply(db,'r',{kind:'reconcile',account:'tiền mặt',actual:1000000,category:'đối soát',note:'test'});
  await apply(db,'i',flow('income',200000));await apply(db,'e',flow('expense'));
  assert.equal((await first(db,"SELECT balance FROM balances WHERE id='cash'")).balance,1150000);
  assert.equal((await rows(db,'SELECT sum(amount) AS n FROM postings GROUP BY tx_id')).every(r=>r.n===0),true);
  const r=await report(db,'month',now);assert.deepEqual(r.values,[200000,50000]);
  assert.throws(()=>db.sql.exec("UPDATE transactions SET amount=2 WHERE id='tx-i'"),/IMMUTABLE/);
  assert.throws(()=>db.sql.exec("DELETE FROM postings WHERE tx_id='tx-i'"),/IMMUTABLE/);
  assert.throws(()=>db.sql.exec('DELETE FROM audit'),/IMMUTABLE/);db.close();
});
test('duplicate confirmation applies once; stale reconciliation and expiry cannot apply',async()=>{
  const db=database();await makeDraft(db,'a',flow('expense'),'123',now);
  const results=await Promise.all([confirm(db,'a','123',now),confirm(db,'a','123',now)]);
  assert.equal((await first(db,'SELECT count(*) AS n FROM transactions')).n,1);assert.ok(results.every(r=>r.includes('ghi')));
  await makeDraft(db,'r',{kind:'reconcile',account:'tiền mặt',actual:100,category:'đối soát',note:'n'},'123',now);
  await apply(db,'b',flow('income',10));assert.match(await confirm(db,'r','123',now),/thay đổi/);
  assert.equal((await first(db,"SELECT balance FROM balances WHERE id='cash'")).balance,-49990);
  await makeDraft(db,'expired',flow('income'),'123',now);assert.match(await confirm(db,'expired','123','2026-10-09T06:00:00Z'),/hết hạn/);db.close();
});
test('borrow/lend partial payments conserve balance and reject racing overpayments',async()=>{
  const db=database();await apply(db,'borrow',{...flow('borrow',1000000),person:'An',due:'2026-10-20'});
  await apply(db,'lend',{...flow('lend',300000),person:'Bình',due:null});
  await makeDraft(db,'p1',{...flow('repay',600000),debtId:'debt-borrow'},'123',now);
  await makeDraft(db,'p2',{...flow('repay',600000),debtId:'debt-borrow'},'123',now);
  assert.equal(await confirm(db,'p1','123',now),'Đã ghi nhận.');assert.match(await confirm(db,'p2','123',now),/vượt nợ/);
  await apply(db,'c',{...flow('collect',100000),debtId:'debt-lend'});
  assert.equal((await first(db,"SELECT remaining FROM debts WHERE id='debt-borrow'")).remaining,400000);
  assert.equal((await first(db,"SELECT remaining FROM debts WHERE id='debt-lend'")).remaining,200000);
  assert.equal((await first(db,"SELECT balance FROM balances WHERE id='cash'")).balance,200000);
  assert.deepEqual((await report(db,'month',now)).values,[0,0]);
  await assert.rejects(()=>makeDraft(db,'x',{...flow('collect',200001),debtId:'debt-lend'},'123',now),/vượt nợ/);
  assert.equal((await first(db,"SELECT count(*) AS n FROM transactions WHERE id='tx-p2'")).n,0);db.close();
});
test('credit purchases count expenses; payments/transfers do not; limits roll back whole batch',async()=>{
  const db=database();await createAccount(db,'card','visa','credit',{limit:1000000,statement:10,due:25},now);
  await apply(db,'purchase',flow('expense',600000,'visa'));
  await apply(db,'pay',{kind:'transfer',amount:200000,from:'tiền mặt',to:'visa',category:'trả thẻ',note:'n'});
  assert.equal((await first(db,"SELECT balance FROM balances WHERE id='card'")).balance,-400000);
  await makeDraft(db,'over',flow('expense',700000,'visa'),'123',now);assert.match(await confirm(db,'over','123',now),/hạn mức/);
  assert.equal((await first(db,"SELECT count(*) AS n FROM postings WHERE tx_id='tx-over'")).n,0);
  await makeDraft(db,'overpay',{kind:'transfer',amount:400001,from:'tiền mặt',to:'visa',category:'trả thẻ',note:'n'},'123',now);assert.match(await confirm(db,'overpay','123',now),/hạn mức/);
  assert.deepEqual((await report(db,'month',now)).values,[0,600000]);db.close();
});
test('reversal is additive, single use and reduces the original report category',async()=>{
  const db=database();await apply(db,'e',flow('expense'));await apply(db,'rev',{kind:'reverse',txId:'tx-e',category:'đảo',note:'hủy'});
  assert.equal((await first(db,"SELECT balance FROM balances WHERE id='cash'")).balance,0);assert.deepEqual((await report(db,'month',now)).values,[0,0]);
  await assert.rejects(()=>makeDraft(db,'rev2',{kind:'reverse',txId:'tx-e'},'123',now),/đã đảo/);db.close();
});
test('zero reconciliation records verified status without inventing a flow',async()=>{
  const db=database();await apply(db,'zero',{kind:'reconcile',account:'tiền mặt',actual:0,category:'đối soát',note:'n'});
  assert.equal((await first(db,'SELECT count(*) AS n FROM transactions')).n,0);assert.ok((await first(db,"SELECT reconciled_at FROM accounts WHERE id='cash'")).reconciled_at);db.close();
});
test('SQL rejects sealing an unbalanced transaction and rolls back',async()=>{
  const db=database();await assert.rejects(()=>db.batch([
    db.prepare("INSERT INTO transactions(id,source_key,kind,amount,category,note,occurred_at) VALUES('bad','bad','expense',50,'c','n','2026-10-09T00:00:00Z')"),
    db.prepare("INSERT INTO postings(tx_id,account_id,amount) VALUES('bad','cash',-50)"),db.prepare("UPDATE transactions SET sealed=1 WHERE id='bad'")
  ]),/UNBALANCED/);assert.equal((await first(db,'SELECT count(*) AS n FROM transactions')).n,0);db.close();
});
