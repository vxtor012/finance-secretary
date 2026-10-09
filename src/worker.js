import {authorized,processInbox} from './bot.js';
import {stmt} from './db.js';
import {flushOutbox} from './telegram.js';
import {schedule} from './scheduler.js';
export function validConfig(env) {
  return Boolean(env.DB && /^\d+$/.test(env.OWNER_TELEGRAM_ID||'') && env.TELEGRAM_BOT_TOKEN && /^[A-Za-z0-9_-]{16,256}$/.test(env.TELEGRAM_WEBHOOK_SECRET||'') && (!env.TIMEZONE||['Asia/Ho_Chi_Minh','Asia/Bangkok'].includes(env.TIMEZONE)));
}
export async function timingSafeEqual(a,b) {
  const enc=new TextEncoder(),[x,y]=await Promise.all([crypto.subtle.digest('SHA-256',enc.encode(a)),crypto.subtle.digest('SHA-256',enc.encode(b))]);
  const xx=new Uint8Array(x),yy=new Uint8Array(y);let diff=0;for(let i=0;i<32;i++)diff|=xx[i]^yy[i];return diff===0;
}
async function limitedBody(req) {
  const reader=req.body?.getReader();if(!reader)throw new Error('BODY');
  let total=0;const chunks=[];
  for(;;){const {value,done}=await reader.read();if(done)break;total+=value.length;if(total>16384){await reader.cancel();throw new Error('BODY');}chunks.push(value);}
  const data=new Uint8Array(total);let offset=0;for(const c of chunks){data.set(c,offset);offset+=c.length;}return JSON.parse(new TextDecoder().decode(data));
}
export default {
  async fetch(request,env,ctx) {
    const path=new URL(request.url).pathname;
    if(path==='/health'&&request.method==='GET') return Response.json({ok:true,service:'finance-secretary'});
    if(path!=='/telegram'||request.method!=='POST') return new Response('Not found',{status:404});
    if(!validConfig(env)) return new Response('Service unavailable',{status:503});
    const secret=request.headers.get('X-Telegram-Bot-Api-Secret-Token')||'';
    if(!await timingSafeEqual(secret,env.TELEGRAM_WEBHOOK_SECRET)) return new Response('Unauthorized',{status:401});
    let u;try{u=await limitedBody(request);}catch{return new Response('Bad request',{status:400});}
    if(!u || !Number.isSafeInteger(u.update_id)||u.update_id<0) return new Response('Bad request',{status:400});
    if(!authorized(u,env.OWNER_TELEGRAM_ID)) return new Response('OK');
    const now=new Date().toISOString();
    try {
      await stmt(env.DB,'INSERT OR IGNORE INTO inbox(id,payload,created_at) VALUES(?,?,?)',u.update_id,JSON.stringify(u),now).run();
    } catch {return new Response('Try later',{status:503});}
    ctx.waitUntil((async()=>{await processInbox(env,now,1);await flushOutbox(env,new Date().toISOString(),fetch,2);})().catch(()=>{}));
    return new Response('OK');
  },
  async scheduled(event,env,ctx) {
    if(!validConfig(env)) return;
    const now=new Date(event.scheduledTime).toISOString();
    ctx.waitUntil((async()=>{await processInbox(env,now);await schedule(env,now);await flushOutbox(env,new Date().toISOString());})());
  }
};
