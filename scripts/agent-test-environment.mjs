// Temporary private VPS environment. No ports or production volumes are shared.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,chown,access,copyFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
assert.equal(process.env.PONG_AGENT_TEST_ENV,'isolated-vps');
// One laboratory per arcade deployment. A frozen stamp would have a redeployment
// quietly reuse the previous laboratory's database, secrets and containers.
const stamp=process.env.PONG_AGENT_LAB_STAMP??'20260913';assert(/^20\d{6}(-[2-9])?$/.test(stamp),'The laboratory stamp is a date such as 20260918');
const root=`/opt/pongit/tests/agents-${stamp}`,secret=`/opt/pongit/secrets/agents-candidate-${stamp}`;
const network=`pongit-agents-${stamp}`,database=`pongit-agent-db-${stamp}`;
// The dependency image is the Node and node_modules base. It is rebuilt only when
// the lock file moves, so it keeps its own stamp and is shared between laboratories.
const image=process.env.PONG_AGENT_LAB_IMAGE??'pongit-agent-deps:20260913';assert(/^pongit-agent-deps:20\d{6}$/.test(image));
const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
// The release tree is the code under test and is copied in deliberately. Creating
// it empty here would start every container against nothing.
try{await access(root+'/release/package.json');}catch{throw Error(`Copy the candidate release into ${root}/release first`);}
await mkdir(root+'/private',{recursive:true,mode:0o700});await mkdir(root+'/diagnostics',{recursive:true,mode:0o700});
let password;try{password=await readFile(root+'/private/db-password','utf8');}catch(e){if(e.code!=='ENOENT')throw e;password=randomBytes(32).toString('hex');await writeFile(root+'/private/db-password',password,{mode:0o600});}
const vars={POSTGRES_USER:'agents',POSTGRES_PASSWORD:password,POSTGRES_DB:'agents',DATABASE_URL:`postgresql://agents:${password}@${database}:5432/agents`,
 RPC_URL:process.env.RPC_URL,HOST:'0.0.0.0',PORT:'4100',PONG_AGENT_MANIFEST:'/secrets/manifest.json',PONG_AGENT_KEYS:'/secrets/service.json',
 PONG_AGENT_DIAGNOSTICS:'/diagnostics/agents',PONG_AGENT_SERVICE:'1'};
assert(vars.RPC_URL&&new URL(vars.RPC_URL).protocol==='https:');
// The tick cadence sets how many hub batches a house match costs, so a measurement
// run must be able to choose it without a code change.
if(process.env.PONG_AGENT_TICK_MS){assert(/^[0-9]{3,5}$/.test(process.env.PONG_AGENT_TICK_MS));vars.PONG_AGENT_TICK_MS=process.env.PONG_AGENT_TICK_MS;}
try{vars.HASURA_ADMIN_SECRET=(await readFile(root+'/private/hasura-secret','utf8')).trim();vars.GRAPHQL_URL=`http://pongit-agent-hasura-${stamp}:8080/v1/graphql`;}
catch(e){if(e.code!=='ENOENT')throw e;}
await writeFile(root+'/private/service.env',Object.entries(vars).map(([k,v])=>`${k}=${v}`).join('\n')+'\n',{mode:0o600});
await writeFile(root+'/private/ops.env',`AGENT_DATABASE_URL=${vars.DATABASE_URL}\n`,{mode:0o600});
// This runs as root to reach Docker, so everything it creates must be handed back,
// the laboratory root included: a root-owned tree is what broke the nightly backup.
for(const path of [root,root+'/private',root+'/private/service.env',root+'/private/ops.env',root+'/private/db-password',root+'/diagnostics'])await chown(path,1000,1000);
try{docker('network','inspect',network);}catch{docker('network','create',network);}
try{docker('container','inspect',database);}catch{docker('run','-d','--name',database,'--network',network,'--cpus=.5','--memory=384m','--restart=no',
 '--env-file',root+'/private/service.env','-v',database+':/var/lib/postgresql/data','postgres:17-alpine');}
if(process.argv.includes('--services')){
 const deployPrefix=process.env.PONG_AGENT_DEPLOY_PREFIX??`agent-arcade-candidate-${stamp}`;assert(/^agent-arcade-candidate-[0-9]{8}(-[2-9])?$/.test(deployPrefix));
 const r=JSON.parse(await readFile(`${secret}/${deployPrefix}.json`,'utf8'));
 const m=JSON.parse(await readFile(secret+'/manifest.json','utf8'));assert.equal(m.app.toLowerCase(),r.app.toLowerCase());assert.notEqual(m.app.toLowerCase(),'0x78d3341e3452d7ec1add9371de3008639eed8eb0');
 await writeFile(secret+'/service.json',JSON.stringify({coordinator:r.coordinator,bots:r.bots.map(b=>({address:b.address}))}),{mode:0o600});
 await writeFile(secret+'/house.json',JSON.stringify({creator:r.creator,bots:r.bots}),{mode:0o600});
 await mkdir(secret+'/bot-state',{recursive:true,mode:0o700});
 // Both containers below mount ops/ as their metadata. It used to exist only once
 // the keeper had run, so a first start from this script mounted a directory Docker
 // then created as root. The house keys stay one level above it, out of reach.
 await mkdir(secret+'/ops',{recursive:true,mode:0o700});
 for(const name of ['manifest.json','archive.json']){
  try{await access(`${secret}/ops/${name}`);}catch{await copyFile(`${secret}/${name}`,`${secret}/ops/${name}`);}
  await chown(`${secret}/ops/${name}`,1000,1000);
 }
 for(const path of [secret+'/manifest.json',secret+'/service.json',secret+'/house.json',secret+'/bot-state',secret+'/ops'])await chown(path,1000,1000);
 // The public activation gate remains false during these private tests.
 assert(!m.enabled&&!m.qualified);
 const common=['--network',network,'--user=1000:1000','--cpus=1','--memory=512m','--restart=no','--cap-drop=ALL','--security-opt=no-new-privileges',
  '--env-file',root+'/private/service.env','-e','PONG_AGENT_MANIFEST=/metadata/manifest.json','-v',root+'/release:/work:ro','-v',secret+'/ops:/metadata:ro','-v',root+'/diagnostics:/diagnostics','-w','/work'];
 const service=`pongit-agent-service-${stamp}`;
 try{docker('container','inspect',service);}catch{docker('run','-d','--name',service,...common,'-v',secret+'/service.json:/secrets/service.json:ro',image,'node','scripts/agent-process.mjs','service');}
 const worker=`pongit-agent-bots-${stamp}`;
 try{docker('container','inspect',worker);}catch{docker('run','-d','--name',worker,...common,'-v',secret+'/house.json:/secrets/house.json:ro','-v',secret+'/bot-state:/secrets/bot-state','-e','PONG_AGENT_SERVICE=0','-e','PONG_AGENT_WORKER=dedicated-authorized',
  '-e','PONG_AGENT_KEYS=/secrets/house.json','-e',`PONG_AGENT_API=http://${service}:4100`,'-e','PONG_AGENT_STATE=/secrets/bot-state',
  image,'node','scripts/agent-process.mjs','bots');}
}
console.log(JSON.stringify({stamp,network,database,publicPorts:[],humanContainersModified:false,services:process.argv.includes('--services')}));
