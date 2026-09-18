// Bounded, isolated qualification supervisor. No public flag is changed here.
// Starts the required 24-hour measurement only after a renewed publication.
import assert from 'node:assert/strict';
import {readFile,mkdir,copyFile,chown} from 'node:fs/promises';
import {spawn,execFileSync} from 'node:child_process';
assert.equal(process.env.PONG_AGENT_KEEPER,'isolated-qualification');
const stamp=process.env.PONG_AGENT_LAB_STAMP??'20260913';assert(/^20\d{6}$/.test(stamp),'The laboratory stamp is a date such as 20260918');
const image=process.env.PONG_AGENT_LAB_IMAGE??'pongit-agent-deps:20260913';assert(/^pongit-agent-deps:20\d{6}$/.test(image));
const root=`/opt/pongit/tests/agents-${stamp}`,secret=`/opt/pongit/secrets/agents-candidate-${stamp}`,metadata=secret+'/ops';
const network=`pongit-agents-${stamp}`,HUMAN_APP='0x78d3341e3452d7ec1add9371de3008639eed8eb0';
// Every dated identifier comes from the same stamp. The operator journal and the
// nonce ledger these name are shared with human production: two laboratories under
// one prefix would interleave their operations in it.
const deployPrefix=process.env.PONG_AGENT_DEPLOY_PREFIX??`agent-arcade-candidate-${stamp}`;
const lifecyclePrefix=process.env.PONG_AGENT_LIFECYCLE_PREFIX??`agent-arcade-lifecycle-${stamp}`;
const archivePrefix=process.env.PONG_AGENT_ARCHIVE_PREFIX??`agent-archive-${stamp}`;
assert(/^agent-arcade-candidate-\d{8}$/.test(deployPrefix)&&/^agent-arcade-lifecycle-\d{8}$/.test(lifecyclePrefix)&&/^agent-archive-\d{8}$/.test(archivePrefix),'Keep the dated prefix shapes');
// The candidate address is whatever this laboratory deployed. Freezing it here
// made the guard false the moment the arcade was redeployed, which is the one
// moment it has to hold.
const candidate=JSON.parse(await readFile(`${secret}/${deployPrefix}.json`,'utf8')).app.toLowerCase();
assert(/^0x[\da-f]{40}$/.test(candidate)&&candidate!==HUMAN_APP,'The laboratory must drive its own candidate arcade');
await mkdir(metadata,{recursive:true,mode:0o700});
// A fresh laboratory has no lifecycle record yet: the first lifecycle step writes
// one. Demanding it here left the keeper retrying an ENOENT every minute forever.
const read=async path=>{try{return await readFile(path,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;return null;}};
const own=async path=>{try{await chown(path,1000,1000);}catch(e){if(e.code!=='ENOENT')throw e;}};
for(const name of ['manifest.json','lifecycle.json','archive.json']){
 if(await read(metadata+'/'+name)===null){
  const source=await read(secret+'/'+name);
  // Only the lifecycle record is legitimately absent on a fresh laboratory: the
  // first lifecycle step writes it. A missing manifest or archive is a real fault
  // and must stop here rather than loop on ENOENT once a minute.
  assert(source!==null||name==='lifecycle.json',`Seed ${secret}/${name} before starting the keeper`);
  if(source===null)continue;
  await copyFile(secret+'/'+name,metadata+'/'+name);
 }
 await own(metadata+'/'+name);
}
await chown(metadata,1000,1000);
const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const run=async(args)=>new Promise((resolve,reject)=>{
 const child=spawn('docker',args,{stdio:['ignore','pipe','pipe']});let out='';
 for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{out+=(b.toString());if(out.length>30000)out=out.slice(-30000);});
 child.on('error',reject);child.on('exit',code=>{const lines=out.split('\n').filter(x=>x.startsWith('{'));for(const line of lines)console.log(line);if(code)reject(Error(`Private agent step exited ${code}: ${out.split('\n').filter(x=>/Error:|AssertionError|reason:/.test(x)).map(x=>x.replace(/0x[\da-fA-F]{64,}/g,'[omitted]')).slice(-2).join(' ').slice(0,240)}`));else resolve();});
});
const common=['run','--rm','--user=1000:1000','--network','pongit_default','--network',network,'--cpus=.5','--memory=512m',
 '--env-file','/opt/pongit/shared/runtime.env','--env-file',root+'/private/ops.env','-e','PONG_INDEPENDENT_WRITE=authorized-testnet',
 '-e','ROOMS_LIFECYCLE_KEY_FILE=/ops/lifecycle.json','-v',secret+'/ops:/secrets','-v','/opt/pongit/secrets/rooms/lifecycle.json:/ops/lifecycle.json:ro',
 '-e','PONG_AGENT_DIAGNOSTICS=/diagnostics/agents','-v',root+'/diagnostics:/diagnostics','-v',root+'/release:/work','-w','/work'];
const stamped=['-e',`PONG_AGENT_LAB_STAMP=${stamp}`,'-e',`PONG_AGENT_LAB_IMAGE=${image}`,'-e',`PONG_AGENT_DEPLOY_PREFIX=${deployPrefix}`,
 '-e',`PONG_AGENT_LIFECYCLE_PREFIX=${lifecyclePrefix}`,'-e',`PONG_AGENT_ARCHIVE_PREFIX=${archivePrefix}`,'-e',`PONG_AGENT_APP=${candidate}`];
const step=(script,env)=>run([...common,'-e',env,...stamped,image,'node','/app/node_modules/tsx/dist/cli.mjs','scripts/agent-operator-step.ts',script]);
let stopped=false;process.on('SIGTERM',()=>{stopped=true;});let lastArchive=0;
while(!stopped){
 try{
  const manifest=JSON.parse(await readFile(metadata+'/manifest.json','utf8'));assert(!manifest.enabled&&!manifest.qualified);assert.equal(manifest.app.toLowerCase(),candidate);
  const record=JSON.parse(await read(metadata+'/lifecycle.json')??'{"events":[]}');
  if(!record.renewalQualified)await step('scripts/agent-lifecycle.ts','PONG_AGENT_LIFECYCLE=qualify-cycle');
  else await step('scripts/agent-lifecycle.ts','PONG_AGENT_LIFECYCLE=maintenance');
  const next=JSON.parse(await read(metadata+'/lifecycle.json')??'{"events":[]}');
  for(const name of ['manifest.json','lifecycle.json'])await own(metadata+'/'+name);
  if(next.stage==='restart-required'){
   for(const name of [`pongit-agent-community-${stamp}`,`pongit-agent-bots-${stamp}`,`pongit-agent-service-${stamp}`]){
    let exists=true;try{docker('inspect',name);}catch{exists=false;}if(exists){docker('stop','-t','45',name);docker('rm',name);}
   }
   // Recreate file bind mounts after atomic metadata replacement.
   await copyFile(metadata+'/manifest.json',secret+'/manifest.json');
   await run(['run','--rm','--env-file','/opt/pongit/shared/runtime.env','-e','PONG_AGENT_TEST_ENV=isolated-vps',...stamped,'-v','/usr/bin/docker:/usr/local/bin/docker:ro','-v','/var/run/docker.sock:/var/run/docker.sock','-v','/opt/pongit:/opt/pongit','-w',root+'/release',image,'node','scripts/agent-test-environment.mjs','--services']);
   await mkdir(root+'/private/community-test',{recursive:true,mode:0o700});await own(root+'/private/community-test');
   docker('run','-d','--name',`pongit-agent-community-${stamp}`,'--network',network,'--user=1000:1000','--cpus=.5','--memory=384m','--cap-drop=ALL','--security-opt=no-new-privileges','-e','AGENT_PRIVATE_QUALIFICATION=isolated-vps',...stamped,'-e','PONG_AGENT_DIAGNOSTICS=/diagnostics/agents','-v',root+'/release:/work:ro','-v',root+'/private/community-test:/secrets/community-test','-v',root+'/diagnostics:/diagnostics','-w','/work',image,'node','/app/node_modules/tsx/dist/cli.mjs','scripts/agent-community-qualification.ts');
  }
  if(next.renewalQualified&&Date.now()-lastArchive>60000){await step('scripts/agent-archive-step.ts','PONG_AGENT_ARCHIVE=dedicated-authorized');lastArchive=Date.now();}
  if(next.renewalQualified){
   const name=`pongit-agent-soak-${stamp}`;let exists=true;try{docker('inspect',name);}catch{exists=false;}
   if(!exists){docker('run','-d','--name',name,'--network',network,'--user=1000:1000','--cpus=.25','--memory=256m','--cap-drop=ALL','--security-opt=no-new-privileges','--env-file',root+'/private/service.env','-e','PONG_AGENT_SERVICE=0','-e','PONG_AGENT_SOAK=dedicated-24h','-e',`PONG_AGENT_API=http://pongit-agent-service-${stamp}:4100`,'-v',root+'/release:/work:ro','-v',secret+'/manifest.json:/secrets/manifest.json:ro','-v',metadata+'/lifecycle.json:/secrets/lifecycle.json:ro','-v',root+'/diagnostics:/diagnostics','-w','/work',image,'node','/app/node_modules/tsx/dist/cli.mjs','scripts/agent-soak.ts');}
   else{const state=JSON.parse(docker('inspect',name))[0].State;if(!state.Running&&state.ExitCode!==0)throw Error('The dedicated soak stopped unexpectedly; review its partial report before restarting');}
  }
 }catch(e){console.error(JSON.stringify({at:new Date().toISOString(),service:'agent-private-keeper',error:e.message}));}
 if(!stopped)await new Promise(resolve=>{const stop=()=>{clearTimeout(timer);process.off('SIGTERM',stop);resolve();};const timer=setTimeout(stop,60000);process.once('SIGTERM',stop);});
}
