import {UserError,clean,amount} from './domain.js';
import {stmt,rows,first,guard,audit,enqueue} from './db.js';
const visible="('cash','bank','credit')";
export async function account(db,name) {
  const a=await first(db,`SELECT * FROM balances WHERE name=? COLLATE NOCASE AND kind IN ${visible}`,name);
  if(!a) throw new UserError(`Chưa có tài khoản “${name}”. Dùng /taikhoan hoặc /the.`);
  return a;
}
export async function prepare(db,p,now) {
  const out={...p,occurredAt:now};
  if(['income','expense','borrow','lend','repay','collect','reconcile'].includes(p.kind)) out.accountId=(await account(db,p.account)).id;
  if(p.kind==='transfer') {
    out.fromId=(await account(db,p.from)).id;out.toId=(await account(db,p.to)).id;
    if(out.fromId===out.toId) throw new UserError('Hai tài khoản chuyển phải khác nhau.');
    const from=await first(db,'SELECT kind FROM accounts WHERE id=?',out.fromId);
    if(from.kind==='credit') throw new UserError('Không hỗ trợ rút/chuyển tiền từ thẻ tín dụng.');
  }
  if(['borrow','lend','repay','collect','income'].includes(p.kind)) {
    const a=await first(db,'SELECT kind FROM accounts WHERE id=?',out.accountId);
    if(a.kind==='credit') throw new UserError('Nghiệp vụ này cần tài khoản tiền mặt/ngân hàng. Trả thẻ dùng /chuyen.');
  }
  if(['repay','collect'].includes(p.kind)) {
    const d=await first(db,'SELECT * FROM debts WHERE id=?',p.debtId);
    if(!d || (p.kind==='repay' ? d.direction!=='borrow':d.direction!=='lend')) throw new UserError('Mã nợ không đúng loại.');
    if(p.amount>d.remaining) throw new UserError(`Còn ${amount(d.remaining)}; không thể thanh toán vượt nợ.`);
    out.debtAccount=d.account_id;out.person=d.person;
  }
  if(p.kind==='reconcile') {
    const a=await first(db,'SELECT * FROM balances WHERE id=?',out.accountId);
    if(a.kind==='credit'&&(p.actual>0 || (a.credit_limit && p.actual < -a.credit_limit))) throw new UserError('Dư nợ thẻ phải từ -hạn mức đến 0.');
    out.expected=a.balance;out.delta=p.actual-a.balance;out.amount=Math.abs(out.delta);
    if(!Number.isSafeInteger(out.amount)||out.amount>1_000_000_000_000) throw new UserError('Chênh lệch đối soát vượt giới hạn 1.000 tỷ VND.');
  }
  if(p.kind==='reverse') {
    const tx=await first(db,'SELECT * FROM transactions WHERE id=? AND sealed=1',p.txId);
    if(!tx || !['income','expense','transfer'].includes(tx.kind)) throw new UserError('Chỉ đảo thu/chi/chuyển tiền; công nợ/đối soát cần bút toán nghiệp vụ riêng.');
    if(await first(db,'SELECT id FROM transactions WHERE reversal_of=?',p.txId)) throw new UserError('Giao dịch đã đảo.');
    if(await first(db,'SELECT id FROM recurring_occurrences WHERE tx_id=?',p.txId)) throw new UserError('Giao dịch thuộc kỳ lặp; chưa hỗ trợ đảo kỳ lặp đã trả.');
    out.originalKind=tx.kind;out.amount=tx.amount;out.category=tx.category;
    out.postings=(await rows(db,'SELECT account_id,amount FROM postings WHERE tx_id=?',p.txId)).map(x=>({account:x.account_id,amount:-x.amount}));
  }
  return out;
}
export function describe(p) {
  const title={income:'Thu',expense:'Chi',transfer:'Chuyển nội bộ',borrow:'Vay',lend:'Cho vay',repay:'Trả nợ',collect:'Thu hồi nợ',reconcile:'Đối soát',reverse:'Đảo giao dịch'}[p.kind];
  return `${title}: ${p.kind==='reconcile'?amount(p.actual):amount(p.amount)}\n${p.from?`${p.from} → ${p.to}`:p.account||p.txId}\n${p.person?`Đối tác: ${p.person}; hạn: ${p.due||'không hạn'}\n`:''}${p.category} • ${p.note}${p.kind==='reconcile'?`\nĐiều chỉnh ${amount(p.delta)}; không tính thu/chi.`:''}\nKiểm tra rồi xác nhận (hết hạn sau 15 phút).`;
}
export async function makeDraft(db,id,p,chat,now) {
  const prepared=await prepare(db,p,now);
  const payload=JSON.stringify(prepared), expires=new Date(Date.parse(now)+15*60000).toISOString();
  await db.batch([
    stmt(db,'INSERT OR IGNORE INTO drafts(id,payload,expires_at,created_at) VALUES(?,?,?,?)',id,payload,expires,now),
    enqueue(db,'draft:'+id,'sendMessage',{chat_id:chat,text:describe(prepared),reply_markup:{inline_keyboard:[[{text:'Xác nhận',callback_data:'ok:'+id},{text:'Bỏ qua',callback_data:'no:'+id}]]}},now)
  ]);
}
export async function confirm(db,id,chat,now) {
  const d=await first(db,'SELECT * FROM drafts WHERE id=?',id);
  if(!d || d.state!=='pending') return 'Yêu cầu đã xử lý hoặc không tồn tại.';
  if(d.expires_at<=now) return 'Yêu cầu đã hết hạn. Hãy nhập lại.';
  const p=JSON.parse(d.payload),txId='tx-'+id;
  const steps=[guard(db,'draft:'+id,"SELECT state='pending' AND expires_at>? FROM drafts WHERE id=?",now,id)];
  if(p.kind==='reconcile') steps.push(guard(db,'balance:'+id,'SELECT balance=? FROM balances WHERE id=?',p.expected,p.accountId));
  if(p.occurrenceId) steps.push(guard(db,'occurrence:'+id,"SELECT state='due' FROM recurring_occurrences WHERE id=?",p.occurrenceId));
  let posts=[];
  const sign=['income','borrow','collect'].includes(p.kind)?1:-1;
  if(['income','expense'].includes(p.kind)) posts=[{account:p.accountId,amount:sign*p.amount},{account:p.kind==='income'?'sys-income':'sys-expense',amount:-sign*p.amount}];
  if(p.kind==='transfer') posts=[{account:p.fromId,amount:-p.amount},{account:p.toId,amount:p.amount}];
  if(['borrow','lend'].includes(p.kind)) {
    const debtId='debt-'+id, debtAccount='da-'+id;
    steps.push(stmt(db,'INSERT INTO accounts(id,name,kind) VALUES(?,?,?)',debtAccount,'@'+debtId,p.kind==='borrow'?'payable':'receivable'));
    steps.push(stmt(db,'INSERT INTO debts(id,account_id,direction,person,principal,remaining,due_date,created_at) VALUES(?,?,?,?,?,?,?,?)',debtId,debtAccount,p.kind,p.person,p.amount,p.amount,p.due,now));
    posts=[{account:p.accountId,amount:sign*p.amount},{account:debtAccount,amount:-sign*p.amount}];
    p.debtId=debtId;
  }
  if(['repay','collect'].includes(p.kind)) posts=[{account:p.accountId,amount:sign*p.amount},{account:p.debtAccount,amount:-sign*p.amount}];
  if(p.kind==='reconcile') posts=p.delta===0?[]:[{account:p.accountId,amount:p.delta},{account:'sys-equity',amount:-p.delta}];
  if(p.kind==='reverse') posts=p.postings;
  if(posts.length) {
    steps.push(stmt(db,'INSERT INTO transactions(id,source_key,kind,amount,category,note,occurred_at,reversal_of) VALUES(?,?,?,?,?,?,?,?)',txId,'draft:'+id,p.kind,p.amount,p.category,p.note,now,p.kind==='reverse'?p.txId:null));
    for(const x of posts) steps.push(stmt(db,'INSERT INTO postings(tx_id,account_id,amount) VALUES(?,?,?)',txId,x.account,x.amount));
    if(['borrow','lend','repay','collect'].includes(p.kind)) steps.push(stmt(db,'INSERT INTO debt_events(tx_id,debt_id,amount,event) VALUES(?,?,?,?)',txId,p.debtId,p.amount,['borrow','lend'].includes(p.kind)?'open':'payment'));
    steps.push(stmt(db,'UPDATE transactions SET sealed=1 WHERE id=?',txId));
  }
  if(p.kind==='reconcile') steps.push(stmt(db,'UPDATE accounts SET reconciled_at=? WHERE id=?',now,p.accountId));
  if(p.occurrenceId) steps.push(stmt(db,"UPDATE recurring_occurrences SET state='paid',tx_id=? WHERE id=?",txId,p.occurrenceId));
  steps.push(stmt(db,"UPDATE drafts SET state='applied' WHERE id=?",id),audit(db,p.kind,posts.length?txId:p.accountId,{draft:id,amount:p.amount}),enqueue(db,'applied:'+id,'sendMessage',{chat_id:chat,text:`Đã ghi ${posts.length?txId:'đối soát (không đổi số dư)'}.${['borrow','lend'].includes(p.kind)?`\nMã nợ: ${p.debtId}`:''}`},now));
  try {await db.batch(steps); return 'Đã ghi nhận.';} catch(e) {
    if(await first(db,"SELECT id FROM drafts WHERE id=? AND state='applied'",id)) return 'Đã ghi nhận trước đó.';
    if(/CREDIT_LIMIT/.test(e.message)) return 'Vượt hạn mức hoặc trả thẻ vượt dư nợ. Chưa ghi sổ.';
    if(/BALANCE_LIMIT/.test(e.message)) return 'Số dư vượt giới hạn 1.000 tỷ VND. Chưa ghi sổ.';
    if(/OVERPAYMENT/.test(e.message)) return 'Số nợ đã thay đổi; trả vượt nợ. Chưa ghi sổ.';
    if(/CHECK|UNIQUE/.test(e.message)) return 'Dữ liệu đã thay đổi. Chưa ghi sổ; hãy nhập lại.';
    throw e;
  }
}
export async function createAccount(db,id,name,kind,config,now) {
  clean(name,40); if(name.startsWith('@')) throw new UserError('Tên @ dành cho tài khoản hệ thống.');
  if(!['cash','bank','credit'].includes(kind)) throw new UserError('Loại tài khoản: cash hoặc bank; thẻ dùng /the.');
  try {await db.batch([stmt(db,'INSERT INTO accounts(id,name,kind,credit_limit,statement_day,due_day) VALUES(?,?,?,?,?,?)',id,name,kind,config?.limit??null,config?.statement??null,config?.due??null),audit(db,'account-create',id,{name,kind,config:config??null})]);}
  catch(e) {if(/UNIQUE/.test(e.message)) throw new UserError('Tên tài khoản đã tồn tại.');throw e;}
}
