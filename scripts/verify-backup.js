import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {verify} from './backup.js';
const [file,flag,target]=process.argv.slice(2);
if(!file || (flag&&flag!=='--sql') || (flag&&!target)) {
  console.error('Usage: npm run backup:verify -- backups/finance.json [--sql backups/restore.sql]');process.exitCode=1;
} else {
  try {
    const result=verify(JSON.parse(readFileSync(file,'utf8')));
    if(target){if(existsSync(target))throw new Error('Output already exists; choose a new file');mkdirSync(dirname(target),{recursive:true});writeFileSync(target,result.sql,{flag:'wx'});}
    console.log(`Backup verified: ${result.transactions} transactions, ${result.accounts} accounts.${target?' Restore SQL written for an EMPTY database.':''}`);
  } catch(e){console.error(e.message);process.exitCode=1;}
}
