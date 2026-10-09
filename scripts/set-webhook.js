// External action: run this only after authorizing deployment and supplying secrets.
const {TELEGRAM_BOT_TOKEN,TELEGRAM_WEBHOOK_SECRET,WORKER_URL}=process.env;
if(!TELEGRAM_BOT_TOKEN||!TELEGRAM_WEBHOOK_SECRET||!WORKER_URL||!/^https:\/\//.test(WORKER_URL)) {
  console.error('Set TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, WORKER_URL=https://your-worker.workers.dev');process.exitCode=1;
} else {
  try {
    const res=await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:new URL('/telegram',WORKER_URL).href,secret_token:TELEGRAM_WEBHOOK_SECRET,allowed_updates:['message','callback_query'],max_connections:1,drop_pending_updates:false}),signal:AbortSignal.timeout(10000)});
    const result=await res.json();if(!res.ok||!result.ok)throw new Error('Telegram rejected webhook; check credentials and URL.');console.log('Webhook configured.');
  } catch {console.error('Webhook setup failed; check credentials, HTTPS URL and network.');process.exitCode=1;}
}
