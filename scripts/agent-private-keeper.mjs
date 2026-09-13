// Bounded, isolated qualification supervisor. No public flag is changed here.
// Starts the required 24-hour measurement only after a renewed publication.
import assert from 'node:assert/strict';
import {readFile,mkdir,copyFile,chown} from 'node:fs/promises';
import {spawn,execFileSync} from 'node:child_process';
assert.equal(process.env.PONG_AGENT_KEEPER,'isolated-qualification');
const root='/opt/pongit/tests/agents-20260913',secret='/opt/pongit/secrets/agents-candidate-20260913',metadata=secret+'/ops';
await mkdir(metadata,{recursive:true,mode:0o700});
for(const name of ['manifest.json','lifecycle.json','archive.json']){
 try{await readFile(metadata+'/'+name);}catch(e){if(e.code!=='ENOENT')throw e;await copyFile(secret+'/'+name,metadata+'/'+name);}
 await chown(metadata+'/'+name,1000,1000);
}
await chown(metadata,1000,1000);
const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const run=async(args)=>new Promise((resolve,reject)=>{
 const child=spawn('docker',args,{stdio:['ignore','pipe','pipe']});let out='';
 for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{out+=(b.toString());if(out.length>30000)out=out.slice(-30000);});
 child.on('error',reject);child.on('exit',code=>{const lines=out.split('\n').filter(x=>x.startsWith('{'));for(const line of lines)console.log(line);if(code)reject(Error(`Private agent step exited ${code}: ${out.split('\n').filter(x=>/Error:|AssertionError|reason:/.test(x)).map(x=>x.replace(/0x[\da-fA-F]{64,}/g,'[omitted]')).slice(-2).join(' ').slice(0,240)}`));else resolve();});
});
const common=['run','--rm','--network','pongit_default','--network','pongit-agents-20260913','--cpus=.5','--memory=512m',
 '--env-file','/opt/pongit/shared/runtime.env','--env-file',root+'/private/ops.env','-e','PONG_INDEPENDENT_WRITE=authorized-testnet',
 '-e','ROOMS_LIFECYCLE_KEY_FILE=/ops/lifecycle.json','-v',secret+'/ops:/secrets','-v','/opt/pongit/secrets/rooms/lifecycle.json:/ops/lifecycle.json:ro',
 '-v',root+'/release:/work','-w','/work'];
const step=(script,env)=>run([...common,'-e',env,'pongit-agent-deps:20260913','node','/app/node_modules/tsx/dist/cli.mjs',script]);
let stopped=false;process.on('SIGTERM',()=>{stopped=true;});let lastArchive=0;
while(!stopped){
 try{
  const manifest=JSON.parse(await readFile(metadata+'/manifest.json','utf8'));assert(!manifest.enabled&&!manifest.qualified);assert.equal(manifest.app,'0x4cecc7fb9f199fbd91dcc4a6e6ea7156e69247d9');
  const record=JSON.parse(await readFile(metadata+'/lifecycle.json','utf8'));
  if(!record.renewalQualified)await step('scripts/agent-lifecycle.ts','PONG_AGENT_LIFECYCLE=qualify-cycle');
  else await step('scripts/agent-lifecycle.ts','PONG_AGENT_LIFECYCLE=maintenance');
  const next=JSON.parse(await readFile(metadata+'/lifecycle.json','utf8'));
  for(const name of ['manifest.json','lifecycle.json'])await chown(metadata+'/'+name,1000,1000);
  if(next.stage==='restart-required'){
   for(const name of ['pongit-agent-community-20260913','pongit-agent-bots-20260913','pongit-agent-service-20260913']){
    let exists=true;try{docker('inspect',name);}catch{exists=false;}if(exists){docker('stop','-t','45',name);docker('rm',name);}
   }
   // Recreate file bind mounts after atomic metadata replacement.
   await copyFile(metadata+'/manifest.json',secret+'/manifest.json');
   await run(['run','--rm','--env-file','/opt/pongit/shared/runtime.env','-e','PONG_AGENT_TEST_ENV=isolated-vps','-v','/usr/bin/docker:/usr/local/bin/docker:ro','-v','/var/run/docker.sock:/var/run/docker.sock','-v','/opt/pongit:/opt/pongit','-w',root+'/release','pongit-agent-deps:20260913','node','scripts/agent-test-environment.mjs','--services']);
   docker('run','-d','--name','pongit-agent-community-20260913','--network','pongit-agents-20260913','--user=1000:1000','--cpus=.5','--memory=384m','--cap-drop=ALL','--security-opt=no-new-privileges','-e','AGENT_PRIVATE_QUALIFICATION=isolated-vps','-v',root+'/release:/work:ro','-v',root+'/private/community-test:/secrets/community-test','-w','/work','pongit-agent-deps:20260913','node','/app/node_modules/tsx/dist/cli.mjs','scripts/agent-community-qualification.ts');
  }
  if(next.renewalQualified&&Date.now()-lastArchive>60000){await step('scripts/agent-archive-step.ts','PONG_AGENT_ARCHIVE=dedicated-authorized');lastArchive=Date.now();}
  if(next.renewalQualified){
   const name='pongit-agent-soak-20260913';let exists=true;try{docker('inspect',name);}catch{exists=false;}
   if(!exists){docker('run','-d','--name',name,'--network','pongit-agents-20260913','--user=1000:1000','--cpus=.25','--memory=256m','--cap-drop=ALL','--security-opt=no-new-privileges','--env-file',root+'/private/service.env','-e','PONG_AGENT_SERVICE=0','-e','PONG_AGENT_SOAK=dedicated-24h','-e','PONG_AGENT_API=http://pongit-agent-service-20260913:4100','-v',root+'/release:/work:ro','-v',secret+'/manifest.json:/secrets/manifest.json:ro','-v',metadata+'/lifecycle.json:/secrets/lifecycle.json:ro','-v',root+'/diagnostics:/diagnostics','-w','/work','pongit-agent-deps:20260913','node','/app/node_modules/tsx/dist/cli.mjs','scripts/agent-soak.ts');}
   else{const state=JSON.parse(docker('inspect',name))[0].State;if(!state.Running&&state.ExitCode!==0)throw Error('The dedicated soak stopped unexpectedly; review its partial report before restarting');}
  }
 }catch(e){console.error(JSON.stringify({at:new Date().toISOString(),service:'agent-private-keeper',error:e.message}));}
 if(!stopped)await new Promise(resolve=>{const stop=()=>{clearTimeout(timer);process.off('SIGTERM',stop);resolve();};const timer=setTimeout(stop,60000);process.once('SIGTERM',stop);});
}
