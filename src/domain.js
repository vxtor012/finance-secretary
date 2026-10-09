export class UserError extends Error {}
export const MAX_AMOUNT = 1_000_000_000_000;
export function money(value) {
  const s = String(value).trim().toLowerCase().replace(/\s*(đ|vnd|₫)$/, '');
  let n;
  const scaled = s.match(/^(\d+(?:[.,]\d{1,3})?)\s*(k|nghìn|ngàn|tr|triệu|m)$/);
  if (scaled) n = Number(scaled[1].replace(',', '.')) * (/k|nghìn|ngàn/.test(scaled[2]) ? 1000 : 1_000_000);
  else if (/^\d+$/.test(s)) n = Number(s);
  else if (/^\d{1,3}(?:[.,]\d{3})+$/.test(s)) n = Number(s.replace(/[.,]/g, ''));
  else throw new UserError('Số tiền chưa rõ. Ví dụ: 50000, 50k, 1,5tr, 1.500.000.');
  if (!Number.isSafeInteger(n) || n <= 0 || n > MAX_AMOUNT) throw new UserError('Số tiền phải là số nguyên VND, lớn hơn 0 và không quá 1.000 tỷ.');
  return n;
}
export function amount(n) { return new Intl.NumberFormat('vi-VN').format(n) + ' đ'; }
export function clean(s, max=120) {
  if (typeof s !== 'string' || !s.trim() || s.length > max || /[\u0000-\u001f<>]/.test(s)) throw new UserError('Tên/ghi chú không hợp lệ hoặc quá dài.');
  return s.trim();
}
export function day(value) {
  const time=Date.parse(value+'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(time) || new Date(time).toISOString().slice(0,10)!==value) throw new UserError('Ngày cần đúng dạng YYYY-MM-DD.');
  return value;
}
export function monthDay(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n<1 || n>28) throw new UserError('Ngày trong tháng phải từ 1–28.');
  return n;
}
export function localDate(time, zone='Asia/Ho_Chi_Minh') {
  const p = new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date(time));
  const get=t=>p.find(x=>x.type===t).value;
  return { date:`${get('year')}-${get('month')}-${get('day')}`, hour:Number(get('hour')) };
}
export function addDays(date,n) { return new Date(Date.parse(date+'T00:00:00Z')+n*86400000).toISOString().slice(0,10); }
export function nextMonth(date, d=Number(date.slice(8))) {
  const a=new Date(date+'T00:00:00Z'); a.setUTCDate(1); a.setUTCMonth(a.getUTCMonth()+1); a.setUTCDate(d); return a.toISOString().slice(0,10);
}
export function period(kind, now, zone='Asia/Ho_Chi_Minh', previous=false) {
  const date=localDate(now,zone).date;
  let start,end;
  if(kind==='week') {
    const weekday=new Date(date+'T00:00:00Z').getUTCDay()||7;
    start=addDays(date,1-weekday-(previous?7:0)); end=addDays(start,7);
  } else if(kind==='month') {
    start=date.slice(0,7)+'-01'; if(previous) { const a=new Date(start+'T00:00:00Z'); a.setUTCMonth(a.getUTCMonth()-1); start=a.toISOString().slice(0,10); } end=nextMonth(start,1);
  } else if(kind==='year') {
    const year=Number(date.slice(0,4))-(previous?1:0); start=year+'-01-01'; end=(year+1)+'-01-01';
  } else throw new UserError('Báo cáo: tuần, tháng hoặc năm.');
  // Vietnam's UTC+7 has no DST. Configuration intentionally restricted to these zones.
  return {start:start+'T00:00:00+07:00',end:end+'T00:00:00+07:00',label:`${start} → ${addDays(end,-1)}`,kind};
}
export function parseRule(text) {
  const t=text.trim(); const parts=t.split('|').map(x=>x.trim());
  const cmd=parts[0].toLowerCase();
  if (cmd==='/chuyen' && parts.length===5) return {kind:'transfer',amount:money(parts[1]),from:clean(parts[2]),to:clean(parts[3]),note:clean(parts[4]),category:'chuyển nội bộ'};
  if ((cmd==='/vay'||cmd==='/chovay') && (parts.length===5||parts.length===6)) return {kind:cmd==='/vay'?'borrow':'lend',amount:money(parts[1]),person:clean(parts[2]),account:clean(parts[3]),due:parts[4]==='-'?null:day(parts[4]),note:parts[5]?clean(parts[5]):'công nợ',category:'công nợ'};
  if ((cmd==='/trano'||cmd==='/thuno')&&parts.length===4) return {kind:cmd==='/trano'?'repay':'collect',debtId:clean(parts[1]),amount:money(parts[2]),account:clean(parts[3]),note:'thanh toán công nợ',category:'công nợ'};
  if(cmd==='/doisoat'&&parts.length===3) {
    const s=parts[2]; const actual=s==='0'?0:(s.startsWith('-')?-money(s.slice(1)):money(s));
    return {kind:'reconcile',account:clean(parts[1]),actual,note:'đối soát số dư thực tế',category:'đối soát'};
  }
  if(cmd==='/huy'&&parts.length===2) return {kind:'reverse',txId:clean(parts[1]),note:'đảo giao dịch',category:'đảo giao dịch'};
  if ((cmd==='/thu'||cmd==='/chi')&&parts.length===5) return {kind:cmd==='/thu'?'income':'expense',amount:money(parts[1]),account:clean(parts[2]),category:clean(parts[3],40),note:clean(parts[4])};
  const m=t.match(/^(thu|chi)\s+(\d[\d.,]*(?:\s*(?:k|tr|triệu|nghìn|ngàn|vnd|đ))?)\s+(.+)$/i);
  if(m) {
    let note=m[3],account='tiền mặt',category=m[1].toLowerCase()==='thu'?'thu nhập':'khác';
    const a=note.match(/\s+(?:từ|vào|bằng)\s+(.+?)(?=\s+#|$)/i);
    if(a) {account=clean(a[1]); note=note.replace(a[0],'');}
    const c=note.match(/\s+#([^#]+)$/); if(c){category=clean(c[1],40); note=note.replace(c[0],'');}
    return {kind:m[1].toLowerCase()==='thu'?'income':'expense',amount:money(m[2]),account,note:clean(note),category};
  }
  return null;
}
export function validateAI(x) {
  if(!x || !['income','expense','transfer'].includes(x.kind)) throw new UserError('AI chưa hiểu rõ nghiệp vụ. Hãy dùng /thu, /chi hoặc /chuyen.');
  if(typeof x.amount!=='number' || !Number.isSafeInteger(x.amount)) throw new UserError('AI trả số tiền không hợp lệ.');
  const out={kind:x.kind,amount:money(String(x.amount)),note:clean(x.note),category:clean(x.category,40)};
  if(x.kind==='transfer') {out.from=clean(x.from);out.to=clean(x.to);} else out.account=clean(x.account);
  return out;
}
export const HELP=`Thư ký Tài chính • VND • chat riêng

chi 50k ăn trưa
thu 12tr lương vào ngân hàng #lương
/thu | 12tr | ngân hàng | lương | tháng 10
/chi | 50k | tiền mặt | ăn uống | ăn trưa
/taikhoan | ngân hàng | bank
/the | visa | 20tr | 10 | 25
/chuyen | 1tr | ngân hàng | tiền mặt | rút ATM
/chuyen | 500k | ngân hàng | visa | trả thẻ
/vay | 2tr | An | ngân hàng | 2026-11-01
/chovay | 1tr | Bình | tiền mặt | -
/trano | mã_nợ | 500k | ngân hàng
/thuno | mã_nợ | 200k | tiền mặt
/doisoat | ngân hàng | 3000000
/doisoat | visa | -500000
/laplai | thuê trọ | 3tr | ngân hàng | nhà ở | 5
/dinhky • /dunglap | mã_lặp • /tralap | mã_kỳ • /bolap | mã_kỳ
/sodu • /congno • /lichsu • /huy | mã_giao_dịch
/baocao tuần • /baocao tháng • /baocao năm
/backup • /xuat

Mỗi bút toán cần Xác nhận. Tài khoản mới = 0 CHƯA ĐỐI SOÁT; /doisoat ghi điều chỉnh, không ghi thu nhập. Chuyển tiền/trả nợ/trả thẻ không tính chi tiêu. Kỳ lặp chỉ nhắc, không tự trừ tiền. Ngày thẻ/lặp: 1–28. Công nợ không tính lãi. Số dư thẻ âm = đang nợ.`;
