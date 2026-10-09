import {test} from 'node:test';
import assert from 'node:assert/strict';
import {money,parseRule,day,period,localDate,validateAI} from '../src/domain.js';
test('VND: strict integers, Vietnamese units and separators',()=>{
  for(const [s,n] of [['50k',50000],['1,5tr',1500000],['1.500.000',1500000],['50000 đ',50000],['0,5k',500]])assert.equal(money(s),n);
  for(const s of ['-1','0','abc','1e6','1,25','1.2.3','0,0001k','999999999999999999'])assert.throws(()=>money(s));
});
test('rule parser resolves account and category without AI',()=>{
  assert.deepEqual(parseRule('chi 50k ăn trưa bằng ngân hàng #ăn uống'),{kind:'expense',amount:50000,account:'ngân hàng',category:'ăn uống',note:'ăn trưa'});
  assert.equal(parseRule('/chuyen | 1tr | ngân hàng | tiền mặt | rút ATM').amount,1000000);
  assert.equal(parseRule('/vay | 2tr | An | tiền mặt | -').due,null);
  assert.equal(parseRule('/doisoat | tiền mặt | 0').actual,0);
  assert.equal(parseRule('không rõ'),null);
});
test('invalid dates and untrusted AI fields rejected',()=>{
  for(const d of ['2026-02-29','2026-99-99','x','2026-04-31'])assert.throws(()=>day(d));
  assert.equal(day('2028-02-29'),'2028-02-29');
  assert.throws(()=>validateAI({kind:'borrow',amount:500}));
  assert.throws(()=>validateAI({kind:'expense',amount:'50000',account:'tiền mặt',note:'n',category:'c'}));
  assert.throws(()=>validateAI({kind:'expense',amount:50000,account:'<script>',note:'n',category:'c'}));
});
test('Vietnam periods use local midnight across year/week boundaries',()=>{
  const t='2026-12-31T18:00:00.000Z';assert.equal(localDate(t).date,'2027-01-01');
  assert.equal(period('year',t,undefined,true).start,'2026-01-01T00:00:00+07:00');
  const p=period('week','2026-10-12T01:00:00Z',undefined,true);
  assert.equal(p.start,'2026-10-05T00:00:00+07:00');assert.equal(p.end,'2026-10-12T00:00:00+07:00');
});
