import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
// Same SQLite schema/triggers as D1. Batch emulates D1 atomic rollback.
export function database() {
  const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../migrations/0001_ledger.sql',import.meta.url),'utf8'));
  const db={sql,prepare(query) {
    const make=(args=[])=>({query,args,bind(...values){return make(values);},
      async first(column){const r=sql.prepare(query).get(...args);return r?(column?r[column]:{...r}):null;},
      async all(){return {results:sql.prepare(query).all(...args).map(x=>({...x})),success:true};},
      async run(){const r=sql.prepare(query).run(...args);return {success:true,meta:{changes:r.changes}};}
    });return make();},
    async batch(statements) {
      sql.exec('BEGIN');try {const result=[];for(const s of statements){const found=sql.prepare(s.query).all(...s.args);result.push({success:true,results:found.map(x=>({...x}))});}sql.exec('COMMIT');return result;}
      catch(e){sql.exec('ROLLBACK');throw e;}
    },close(){sql.close();}
  };return db;
}
export function environment(db,extra={}) {return {DB:db,OWNER_TELEGRAM_ID:'123',TELEGRAM_BOT_TOKEN:'TEST',TELEGRAM_WEBHOOK_SECRET:'unit_test_secret_12345',TIMEZONE:'Asia/Ho_Chi_Minh',AI_ENABLED:'false',AI_DAILY_LIMIT:'20',AUTO_BACKUP:'true',...extra};}
export function update(id,text) {return {update_id:id,message:{from:{id:123,is_bot:false},chat:{id:123,type:'private'},text}};}
