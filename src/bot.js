import {HELP,UserError,parseRule,money,clean,monthDay,amount} from './domain.js';
import {rows,first,stmt,audit,enqueue} from './db.js';
import {makeDraft,confirm,createAccount,account} from './ledger.js';
import {parseAI} from './ai.js';
import {enqueueReport} from './reports.js';
import {failedJobs} from './telegram.js';
export function authorized(update,owner) {
  const m=update.message,cb=update.callback_query;
  if(m) return String(m.from?.id)===owner && String(m.chat?.id)===owner && m.chat?.type==='private' && !m.from?.is_bot;
  if(cb) return String(cb.from?.id)===owner && String(cb.message?.chat?.id)===owner && cb.message?.chat?.type==='private';
  return false;
}
async function reply(env,id,text,now) {await enqueue(env.DB,'reply:'+id,'sendMessage',{chat_id:env.OWNER_TELEGRAM_ID,text},now).run();}
export async function handleUpdate(env,u,now) {
  const db=env.DB,key=String(u.update_id),chat=env.OWNER_TELEGRAM_ID;
  if(!authorized(u,chat)) return;
  if(u.callback_query) {
    const cb=u.callback_query,[action,id]=String(cb.data||'').split(':');
    if(!/^[a-zA-Z0-9_-]{1,50}$/.test(id||'')||!['ok','no'].includes(action)) return;
    let answer;
    if(action==='ok') answer=await confirm(db,id,chat,now);
    else {await stmt(db,"UPDATE drafts SET state='cancelled' WHERE id=? AND state='pending'",id).run();answer='Đã bỏ qua nếu yêu cầu còn chờ.';}
    await enqueue(db,'callback:'+key,'answerCallbackQuery',{callback_query_id:cb.id,text:answer.slice(0,190)},now).run();
    // Also visible if the callback popup expired during retry.
    if(action==='ok' && answer!=='Đã ghi nhận.') await reply(env,key,answer,now);
    return;
  }
  const text=u.message?.text;if(typeof text!=='string') {await reply(env,key,'Hiện hỗ trợ tin nhắn văn bản tiếng Việt. Dùng /help.',now);return;}
  if(text.length>1000) throw new UserError('Tin nhắn tối đa 1.000 ký tự.');
  if(/^\/(help|start)$/.test(text)) {await reply(env,key,HELP,now);return;}
  if(text==='/sodu') {
    const a=await rows(db,"SELECT * FROM balances WHERE kind IN ('cash','bank','credit') ORDER BY name");
    await reply(env,key,a.map(x=>`${x.name}: ${amount(x.balance)} • ${x.reconciled_at?'đã đối soát '+x.reconciled_at.slice(0,10):'CHƯA ĐỐI SOÁT'}${x.kind==='credit'?`\nHạn mức ${amount(x.credit_limit)}, còn ${amount(x.credit_limit+x.balance)}; chốt ${x.statement_day}, hạn trả ${x.due_day}`:''}`).join('\n').slice(0,4000),now);return;
  }
  if(text==='/congno') {
    const ds=await rows(db,'SELECT * FROM debts WHERE remaining>0 ORDER BY due_date IS NULL,due_date LIMIT 30');
    await reply(env,key,ds.map(x=>`${x.id} • ${x.direction==='borrow'?'nợ':'cho vay'} ${x.person}: ${amount(x.remaining)} / ${amount(x.principal)}; hạn ${x.due_date||'không hạn'}`).join('\n')||'Không có công nợ đang mở.',now);return;
  }
  if(text==='/lichsu') {
    const ts=await rows(db,'SELECT * FROM transactions WHERE sealed=1 ORDER BY created_at DESC,id DESC LIMIT 15');
    await reply(env,key,ts.map(t=>`${t.id} • ${t.kind} ${amount(t.amount)} • ${t.note} • ${t.occurred_at.slice(0,10)}`).join('\n')||'Chưa ghi giao dịch.',now);return;
  }
  if(text==='/trangthai') {const jobs=await failedJobs(db);await reply(env,key,`Tác vụ lỗi: gửi ${jobs.outbox}, xử lý ${jobs.inbox}. Dùng hướng dẫn vận hành để kiểm tra.`,now);return;}
  if(text.startsWith('/baocao ')) {
    const kind={'tuần':'week','tháng':'month','năm':'year'}[text.slice(8).trim()];
    if(!kind) throw new UserError('Dùng /baocao tuần, /baocao tháng, /baocao năm.');
    await enqueueReport(db,'manual:'+key,chat,kind,now,env.TIMEZONE||'Asia/Ho_Chi_Minh');return;
  }
  if(text==='/backup'||text==='/xuat') {await enqueue(db,'export:'+key,text==='/backup'?'backup':'csv',{chat_id:chat,at:now},now).run();return;}
  const parts=text.split('|').map(x=>x.trim()),cmd=parts[0];
  if(cmd==='/taikhoan'||cmd==='/the') {
    if((cmd==='/taikhoan'&&parts.length!==3)||(cmd==='/the'&&parts.length!==5)) throw new UserError('Dùng /taikhoan | tên | cash hoặc bank; /the | tên | hạn mức | ngày chốt | ngày trả');
    const config=cmd==='/the'?{limit:money(parts[2]),statement:monthDay(parts[3]),due:monthDay(parts[4])}:null;
    if(cmd==='/taikhoan'&&!['cash','bank'].includes(parts[2])) throw new UserError('Loại tài khoản: cash hoặc bank.');
    if(!await first(db,'SELECT id FROM accounts WHERE id=?','acc-'+key)) await createAccount(db,'acc-'+key,parts[1],cmd==='/the'?'credit':parts[2],config,now);
    await reply(env,key,`Đã tạo ${parts[1]}: 0 đ • CHƯA ĐỐI SOÁT. Dùng /doisoat khi biết số dư thực tế.`,now);return;
  }
  if(cmd==='/laplai') {
    if(parts.length!==6) throw new UserError('/laplai | tên | số tiền | tài khoản | nhóm | ngày 1–28');
    const a=await account(db,parts[3]),id='rec-'+key;
    await db.batch([stmt(db,'INSERT OR IGNORE INTO recurring(id,name,amount,account_id,category,day,created_at) VALUES(?,?,?,?,?,?,?)',id,clean(parts[1],40),money(parts[2]),a.id,clean(parts[4],40),monthDay(parts[5]),now),audit(db,'recurring-create',id,{source:key})]);
    await reply(env,key,`Đã tạo ${id}. Chỉ nhắc thanh toán, không tự ghi chi.`,now);return;
  }
  if(text==='/dinhky') {
    const recs=await rows(db,'SELECT * FROM recurring WHERE active=1 LIMIT 20'),occs=await rows(db,"SELECT o.*,r.name FROM recurring_occurrences o JOIN recurring r ON r.id=o.recurring_id WHERE o.state='due' ORDER BY o.due_date LIMIT 20");
    await reply(env,key,('Khoản lặp:\n'+recs.map(r=>`${r.id} ${r.name}: ${amount(r.amount)}, ngày ${r.day}`).join('\n')+'\nKỳ chưa trả:\n'+occs.map(o=>`${o.id} ${o.name} hạn ${o.due_date}`).join('\n')).slice(0,4000),now);return;
  }
  if(cmd==='/dunglap'&&parts.length===2) {
    await db.batch([stmt(db,'UPDATE recurring SET active=0 WHERE id=?',parts[1]),audit(db,'recurring-stop',parts[1],{source:key})]);await reply(env,key,'Đã dừng khoản lặp nếu mã tồn tại. Kỳ đang nợ giữ lại trong /dinhky.',now);return;
  }
  if(cmd==='/bolap'&&parts.length===2) {
    await db.batch([stmt(db,"UPDATE recurring_occurrences SET state='skipped' WHERE id=? AND state='due'",parts[1]),audit(db,'recurring-skip',parts[1],{source:key})]);await reply(env,key,'Đã bỏ kỳ nếu còn chờ; không ghi chi.',now);return;
  }
  if(cmd==='/tralap'&&parts.length===2) {
    const o=await first(db,"SELECT o.id,r.amount,r.category,r.name,a.name AS account FROM recurring_occurrences o JOIN recurring r ON r.id=o.recurring_id JOIN accounts a ON a.id=r.account_id WHERE o.id=? AND o.state='due'",parts[1]);
    if(!o) throw new UserError('Kỳ không tồn tại hoặc đã xử lý.');
    await makeDraft(db,'d-'+key,{kind:'expense',amount:o.amount,account:o.account,category:o.category,note:o.name,occurrenceId:o.id},chat,now);return;
  }
  const p=parseRule(text) || (!text.startsWith('/')?await parseAI(env,text,now):null);
  if(!p) throw new UserError('Chưa hiểu rõ. Ví dụ “chi 50k ăn trưa”, hoặc /help. AI không khả dụng vẫn dùng các lệnh được.');
  await makeDraft(db,'d-'+key,p,chat,now);
}
export async function processInbox(env,now,maxJobs=4) {
  await stmt(env.DB,"UPDATE inbox SET state='failed' WHERE state='processing' AND attempts>=5 AND lease_until<?",now).run();
  for(let i=0;i<maxJobs;i++) {
    const lease=new Date(Date.parse(now)+60000).toISOString();
    const job=await stmt(env.DB,`UPDATE inbox SET state='processing',lease_until=?,attempts=attempts+1 WHERE id=(SELECT id FROM inbox WHERE (state='pending' OR (state='processing' AND lease_until<?)) AND attempts<5 ORDER BY id LIMIT 1) RETURNING *`,lease,now).first();
    if(!job) break;
    try {
      try{await handleUpdate(env,JSON.parse(job.payload),now);}catch(e){if(e instanceof UserError) await reply(env,String(job.id),e.message,now);else throw e;}
      await stmt(env.DB,"UPDATE inbox SET state='done',lease_until=NULL WHERE id=? AND lease_until=?",job.id,lease).run();
    } catch {
      await stmt(env.DB,"UPDATE inbox SET state=CASE WHEN attempts>=5 THEN 'failed' ELSE 'processing' END,lease_until=? WHERE id=? AND lease_until=?",new Date(Date.parse(now)+60000).toISOString(),job.id,lease).run();
    }
  }
}
