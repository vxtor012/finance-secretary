export const stmt=(db,sql,...args)=>db.prepare(sql).bind(...args);
export const rows=async(db,sql,...args)=>(await stmt(db,sql,...args).all()).results;
export const first=(db,sql,...args)=>stmt(db,sql,...args).first();
export function guard(db,id,sql,...args) {return stmt(db,`INSERT INTO guards(id,ok) SELECT ?, CASE WHEN (${sql}) THEN 1 ELSE 0 END`,id,...args);}
export const audit=(db,action,id,detail)=>stmt(db,'INSERT INTO audit(action,entity_id,detail) VALUES(?,?,?)',action,id,JSON.stringify(detail));
export const enqueue=(db,id,method,payload,now)=>stmt(db,'INSERT OR IGNORE INTO outbox(id,method,payload,created_at) VALUES(?,?,?,?)',id,method,JSON.stringify(payload),now);
