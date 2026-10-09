import {rows,enqueue} from './db.js';
import {amount,period,UserError} from './domain.js';
import {escapeHTML} from './telegram.js';
export async function report(db,kind,now,zone,previous=false) {
  const p=period(kind,now,zone,previous),start=new Date(p.start).toISOString(),end=new Date(p.end).toISOString();
  // Signed flows into the system expense/income accounts also include reversals.
  const groups=await rows(db,`SELECT a.kind,t.category,sum(p.amount) AS total FROM postings p JOIN transactions t ON t.id=p.tx_id JOIN accounts a ON a.id=p.account_id WHERE t.sealed=1 AND t.occurred_at>=? AND t.occurred_at<? AND a.kind IN ('income','expense') GROUP BY a.kind,t.category ORDER BY total DESC`,start,end);
  const income=-groups.filter(g=>g.kind==='income').reduce((s,g)=>s+g.total,0),expense=groups.filter(g=>g.kind==='expense').reduce((s,g)=>s+g.total,0);
  const accounts=await rows(db,"SELECT * FROM balances WHERE kind IN ('cash','bank','credit') ORDER BY name");
  const debts=await rows(db,'SELECT direction,sum(remaining) AS remaining FROM debts GROUP BY direction');
  const table=groups.slice(0,15).map(g=>`${g.kind==='income'?'Thu':'Chi'} ${g.category.slice(0,24).padEnd(24)} ${amount(g.kind==='income'?-g.total:g.total)}`).join('\n')||'Chưa có thu/chi trong kỳ.';
  const ratio=income>0?`Chi/thu: ${Math.round(expense/income*100)}%.`:'Chưa có thu nhập trong kỳ để tính tỷ lệ.';
  const summary=expense>income?'Chi tiêu cao hơn thu nhập kỳ này. Hãy xem nhóm chi lớn trước khi điều chỉnh.':'Thu nhập đủ bù chi tiêu trong kỳ này.';
  const text=`<b>Báo cáo ${kind==='week'?'tuần':kind==='month'?'tháng':'năm'}</b> • ${p.label}\nThu: ${amount(income)}\nChi: ${amount(expense)}\nChênh lệch: ${amount(income-expense)}\n<pre>${escapeHTML(table)}</pre>\n${ratio} ${summary}\n\n<b>Số dư hiện tại (không phải số dư cuối kỳ)</b>\n${accounts.slice(0,20).map(a=>escapeHTML(a.name)+': '+amount(a.balance)+(a.reconciled_at?' • đã đối soát '+a.reconciled_at.slice(0,10):' • CHƯA ĐỐI SOÁT')).join('\n')}${accounts.length>20?'\nChỉ hiển thị 20 tài khoản đầu; dùng /backup xem đủ.':''}\n${debts.map(d=>d.direction==='borrow'?'Phải trả: '+amount(d.remaining):'Phải thu: '+amount(d.remaining)).join('\n')}\nChuyển tiền, trả nợ, trả thẻ, đối soát không tính thu/chi. Đây là diễn giải theo quy tắc, không gửi số liệu cho AI.`;
  return {text,values:[Math.max(0,income),Math.max(0,expense)],caption:`${p.label} • trái xanh: thu ${amount(income)}; phải đỏ: chi ${amount(expense)}${income<0||expense<0?' (biểu đồ chặn phần âm; xem bảng)':''}`,period:p};
}
export async function enqueueReport(db,id,chat,kind,now,zone,previous=false) {
  const r=await report(db,kind,now,zone,previous);
  if(r.text.length>4096) throw new UserError('Báo cáo quá dài; dùng /xuat để xem chi tiết.');
  await db.batch([enqueue(db,id+':text','sendMessage',{chat_id:chat,text:r.text,parse_mode:'HTML'},now),enqueue(db,id+':chart','chart',{chat_id:chat,values:r.values,caption:r.caption},now)]);
}
