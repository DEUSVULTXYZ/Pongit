// Isolated candidate backup, with one exported PostgreSQL snapshot so live
// games need not be stopped for an exact restore-count comparison.
import assert from 'node:assert/strict';
import {mkdir,cp,writeFile,chown,readdir,readFile} from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {Pool} from 'pg';
assert.equal(process.env.PONG_AGENT_BACKUP_VERIFY,'isolated-vps');
// A re-runnable verification needs its own root: a fixed one already exists after
// the first pass, so a second run would abort on EEXIST or overwrite the evidence.
// Set PONG_AGENT_BACKUP_ROOT for each further run of the same laboratory.
const stamp=process.env.PONG_AGENT_LAB_STAMP??'20260913';assert.match(stamp,/^20\d{6}$/,'The laboratory stamp is a date such as 20260918');
const root=process.env.PONG_AGENT_BACKUP_ROOT??`/opt/pongit/tests/agents-${stamp}/private/backup-${stamp}`,container=`pongit-agent-db-${stamp}`;
assert(root.startsWith('/opt/pongit/tests/agents-')&&root.includes('/private/')&&!root.includes('..'),'Keep candidate backups inside the private test root');
const connection=new URL(process.env.DATABASE_URL!);assert.equal(connection.hostname,container);assert.equal(connection.pathname,'/agents');
const db=new Pool({connectionString:String(connection),max:2}),source=await db.connect();
const scratch=`agents_restore_verify_${Date.now()}`;assert(/^agents_restore_verify_\d+$/.test(scratch));
const run=(...args:string[])=>execFileSync('docker',['exec',container,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const counts=async(client:any)=>{const tables=(await client.query("SELECT table_schema,table_name FROM information_schema.tables WHERE table_type='BASE TABLE' AND table_schema='agent_arcade' ORDER BY table_name")).rows;const result:Record<string,number>={};for(const t of tables){assert(/^[a-z_]+$/.test(t.table_name));result[t.table_name]=Number((await client.query(`SELECT count(*) AS n FROM agent_arcade."${t.table_name}"`)).rows[0].n);}return result;};
await mkdir(root,{mode:0o700,recursive:true});
try{
 await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const snapshot=(await source.query('SELECT pg_export_snapshot() AS id')).rows[0].id;const expected=await counts(source);
 const dump=spawn('docker',['exec',container,'pg_dump','-U','agents','-d','agents','-Fc','--snapshot='+snapshot],{stdio:['ignore','pipe','inherit']});
 const dumped=new Promise(r=>dump.once('exit',r));await pipeline(dump.stdout!,createWriteStream(root+'/agents.dump',{mode:0o600}));assert.equal(await dumped,0);await source.query('COMMIT');
 await cp(`/opt/pongit/secrets/agents-candidate-${stamp}`,root+'/agent-secrets',{recursive:true});
 run('createdb','-U','agents',scratch);
 const restore=spawn('docker',['exec','-i',container,'pg_restore','-U','agents','-d',scratch,'--no-owner','--exit-on-error'],{stdio:['pipe','inherit','inherit']});
 const restored=new Promise(r=>restore.once('exit',r));await pipeline(createReadStream(root+'/agents.dump'),restore.stdin!);assert.equal(await restored,0);
 connection.pathname='/'+scratch;const verify=new Pool({connectionString:String(connection),max:1});
 try{assert.deepEqual(await counts(verify),expected);}finally{await verify.end();}
 run('dropdb','-U','agents',scratch);
 const checksum=createHash('sha256').update(await readFile(root+'/agents.dump')).digest('hex');
 const report={at:new Date().toISOString(),scope:'Live dedicated database exported snapshot, exact scratch restore and private agent-key backup',root,checksum,tables:expected,sourceUnchanged:true,passed:true};
 await writeFile(root+'/validation.json',JSON.stringify(report,null,2),{mode:0o600});
 const own=async(path:string)=>{await chown(path,1000,1000);for(const e of await readdir(path,{withFileTypes:true})){if(e.isDirectory())await own(path+'/'+e.name);else await chown(path+'/'+e.name,1000,1000);}};await own(root);
 await mkdir('artifacts/agents',{recursive:true});await writeFile('artifacts/agents/backup-restore.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await source.query('ROLLBACK').catch(()=>{});source.release();await db.end();}
