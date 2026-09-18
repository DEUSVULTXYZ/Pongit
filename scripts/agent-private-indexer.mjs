// Private full backfill from the existing human history boundary, with the
// additional agent archive. Never resets or changes the production database.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
assert.equal(process.env.PONG_AGENT_INDEXER,'isolated-backfill');
const stamp=process.env.PONG_AGENT_LAB_STAMP??'20260913';assert(/^20\d{6}(-[2-9])?$/.test(stamp),'The laboratory stamp is a date such as 20260918');
const root=`/opt/pongit/tests/agents-${stamp}`,release=root+'/release',privateDir=root+'/private';
const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const db=`pongit-agent-db-${stamp}`,database='agent_indexer',hasura=`pongit-agent-hasura-${stamp}`,indexer=`pongit-agent-indexer-${stamp}`;
const network=`pongit-agents-${stamp}`,tag=`pongit-agent-indexer:${stamp}`;
let password;try{password=(await readFile(privateDir+'/db-password','utf8')).trim();}catch(e){if(e.code!=='ENOENT')throw e;throw Error('Run agent-test-environment.mjs for this laboratory first');}
// The database container is created without waiting for initdb to finish.
for(let i=0;;i++){try{docker('exec',db,'pg_isready','-U','agents','-d','agents');break;}catch(e){if(i>=30)throw Error(`${db} did not become ready`);await new Promise(r=>setTimeout(r,2000));}}
let secret;try{secret=await readFile(privateDir+'/hasura-secret','utf8');}catch(e){if(e.code!=='ENOENT')throw e;secret=randomBytes(32).toString('hex');await writeFile(privateDir+'/hasura-secret',secret,{mode:0o600});}
const exists=docker('exec',db,'psql','-U','agents','-d','agents','-Atc',"SELECT 1 FROM pg_database WHERE datname='agent_indexer'");
if(!exists)docker('exec',db,'createdb','-U','agents',database);
const values={ENVIO_PG_HOST:db,ENVIO_PG_PORT:5432,ENVIO_PG_USER:'agents',ENVIO_PG_PASSWORD:password,ENVIO_PG_DATABASE:database,ENVIO_PG_SCHEMA:'indexer',
 HASURA_GRAPHQL_DATABASE_URL:`postgres://agents:${password}@${db}:5432/${database}`,HASURA_GRAPHQL_ADMIN_SECRET:secret,HASURA_GRAPHQL_ENDPOINT:`http://${hasura}:8080/v1/metadata`,HASURA_GRAPHQL_ENABLE_CONSOLE:'false',INDEXER_READ_RPC_URL:'http://rpc-indexer:8545'};
await writeFile(privateDir+'/indexer.env',Object.entries(values).map(([k,v])=>`${k}=${v}`).join('\n')+'\n',{mode:0o600});
execFileSync(process.execPath,['/app/node_modules/tsx/dist/cli.mjs','scripts/configure-indexer.ts'],{cwd:release,env:{...process.env,INDEXER_HISTORY_START_BLOCK:'62260200',INDEXER_RPC_URL:'http://rpc-indexer:8545',INDEXER_CHUNKED_RPC:'true'},stdio:'inherit'});
execFileSync('docker',['build','--memory=1024m','-t',tag,release+'/indexer'],{stdio:'inherit'});
for(const name of [hasura,indexer]){
 let existing=true;try{docker('inspect',name);}catch{existing=false;}if(existing)continue;
 const common=['run','-d','--name',name,'--network',network,'--cpus=.75',`--memory=${name===indexer?'768m':'384m'}`,'--restart=no','--security-opt=no-new-privileges','--env-file',privateDir+'/indexer.env'];
 if(name===indexer)common.push('--network','pongit_default');
 docker(...common,name===indexer?tag:'hasura/graphql-engine:v2.48.6');
}
console.log(JSON.stringify({database,hasura,indexer,historyStartBlock:62260200,publicPorts:[],productionModified:false}));
