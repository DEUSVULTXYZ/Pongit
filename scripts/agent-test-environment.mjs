// Temporary private VPS environment. No ports or production volumes are shared.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,chown} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
assert.equal(process.env.PONG_AGENT_TEST_ENV,'isolated-vps');
const root='/opt/pongit/tests/agents-20260913',secret='/opt/pongit/secrets/agents-candidate-20260913';
const network='pongit-agents-20260913',database='pongit-agent-db-20260913';
const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
await mkdir(root+'/private',{recursive:true,mode:0o700});await mkdir(root+'/diagnostics',{recursive:true,mode:0o700});
let password;try{password=await readFile(root+'/private/db-password','utf8');}catch(e){if(e.code!=='ENOENT')throw e;password=randomBytes(32).toString('hex');await writeFile(root+'/private/db-password',password,{mode:0o600});}
const vars={POSTGRES_USER:'agents',POSTGRES_PASSWORD:password,POSTGRES_DB:'agents',DATABASE_URL:`postgresql://agents:${password}@${database}:5432/agents`,
 RPC_URL:process.env.RPC_URL,HOST:'0.0.0.0',PORT:'4100',PONG_AGENT_MANIFEST:'/secrets/manifest.json',PONG_AGENT_KEYS:'/secrets/service.json',
 PONG_AGENT_DIAGNOSTICS:'/diagnostics/agents',PONG_AGENT_SERVICE:'1'};
assert(vars.RPC_URL&&new URL(vars.RPC_URL).protocol==='https:');
try{vars.HASURA_ADMIN_SECRET=(await readFile(root+'/private/hasura-secret','utf8')).trim();vars.GRAPHQL_URL='http://pongit-agent-hasura-20260913:8080/v1/graphql';}
catch(e){if(e.code!=='ENOENT')throw e;}
await writeFile(root+'/private/service.env',Object.entries(vars).map(([k,v])=>`${k}=${v}`).join('\n')+'\n',{mode:0o600});
await writeFile(root+'/private/ops.env',`AGENT_DATABASE_URL=${vars.DATABASE_URL}\n`,{mode:0o600});
for(const path of [root+'/private',root+'/private/service.env',root+'/private/ops.env',root+'/private/db-password',root+'/diagnostics'])await chown(path,1000,1000);
try{docker('network','inspect',network);}catch{docker('network','create',network);}
try{docker('container','inspect',database);}catch{docker('run','-d','--name',database,'--network',network,'--cpus=.5','--memory=384m','--restart=no',
 '--env-file',root+'/private/service.env','-v','pongit-agent-db-20260913:/var/lib/postgresql/data','postgres:17-alpine');}
if(process.argv.includes('--services')){
 const r=JSON.parse(await readFile(secret+'/agent-arcade-candidate-20260913.json','utf8'));
 const m=JSON.parse(await readFile(secret+'/manifest.json','utf8'));assert.equal(m.app.toLowerCase(),r.app.toLowerCase());assert.notEqual(m.app.toLowerCase(),'0x78d3341e3452d7ec1add9371de3008639eed8eb0');
 await writeFile(secret+'/service.json',JSON.stringify({coordinator:r.coordinator,bots:r.bots.map(b=>({address:b.address}))}),{mode:0o600});
 await writeFile(secret+'/house.json',JSON.stringify({creator:r.creator,bots:r.bots}),{mode:0o600});
 await mkdir(secret+'/bot-state',{recursive:true,mode:0o700});
 for(const path of [secret+'/manifest.json',secret+'/service.json',secret+'/house.json',secret+'/bot-state'])await chown(path,1000,1000);
 // The public activation gate remains false during these private tests.
 assert(!m.enabled&&!m.qualified);
 const common=['--network',network,'--user=1000:1000','--cpus=1','--memory=512m','--restart=no','--cap-drop=ALL','--security-opt=no-new-privileges',
  '--env-file',root+'/private/service.env','-e','PONG_AGENT_MANIFEST=/metadata/manifest.json','-v',root+'/release:/work:ro','-v',secret+'/ops:/metadata:ro','-v',root+'/diagnostics:/diagnostics','-w','/work'];
 const service='pongit-agent-service-20260913';
 try{docker('container','inspect',service);}catch{docker('run','-d','--name',service,...common,'-v',secret+'/service.json:/secrets/service.json:ro','pongit-agent-deps:20260913','node','scripts/agent-process.mjs','service');}
 const worker='pongit-agent-bots-20260913';
 try{docker('container','inspect',worker);}catch{docker('run','-d','--name',worker,...common,'-v',secret+'/house.json:/secrets/house.json:ro','-v',secret+'/bot-state:/secrets/bot-state','-e','PONG_AGENT_SERVICE=0','-e','PONG_AGENT_WORKER=dedicated-authorized',
  '-e','PONG_AGENT_KEYS=/secrets/house.json','-e',`PONG_AGENT_API=http://${service}:4100`,'-e','PONG_AGENT_STATE=/secrets/bot-state',
  'pongit-agent-deps:20260913','node','scripts/agent-process.mjs','bots');}
}
console.log(JSON.stringify({network,database,publicPorts:[],humanContainersModified:false,services:process.argv.includes('--services')}));
