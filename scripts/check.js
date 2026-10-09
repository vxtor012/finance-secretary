import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const files=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(x=>x.isDirectory()?files(join(dir,x.name)):[join(dir,x.name)]);
let failures=0;
for(const f of files('migrations').filter(f=>f.endsWith('.sql'))) {
  const sql=readFileSync(f,'utf8');
  if(sql.includes('\r') || /\bSELECT\s+CASE\b/i.test(sql)) {
    console.error(f,'D1 compatibility: use LF and parenthesized SELECT (CASE ... END).');failures++;
  }
}
for(const f of ['src','scripts','test'].flatMap(files).filter(f=>f.endsWith('.js'))) {
  const r=spawnSync(process.execPath,['--check',f],{encoding:'utf8'});if(r.status!==0){console.error(f,r.stderr||r.error?.message);failures++;}
}
for(const folder of readdirSync('.agents/skills')) {
  const content=readFileSync(`.agents/skills/${folder}/SKILL.md`,'utf8');
  if(!/^---\r?\nname: [a-z0-9-]+\r?\ndescription: .+\r?\n---/.test(content)||/TODO|\[INSERT/.test(content)){console.error('Invalid skill: '+folder);failures++;}
}
if(failures)process.exitCode=1;else console.log('Syntax and project skill metadata verified.');
