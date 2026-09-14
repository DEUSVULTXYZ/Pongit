// Restart only this role when verified deployment metadata changes. No Docker
// socket or privilege to stop the human services is required.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
const role=process.argv[2];assert(['service','bots'].includes(role));
const entry=role==='service'?'relayer/src/agents/server.ts':'scripts/agent-house-worker.ts';
let child,stopping=false,fingerprint='',exitPromise=Promise.resolve(),stoppingChild;
function start(){stoppingChild=undefined;child=spawn(process.execPath,['--import','tsx',entry],{stdio:'inherit'});exitPromise=new Promise(resolve=>child.once('exit',resolve));}
function stop(){return stoppingChild??=(async()=>{if(!child||child.exitCode!==null||child.signalCode!==null)return;const target=child;target.kill('SIGTERM');const timer=setTimeout(()=>target.kill('SIGKILL'),55000);await exitPromise;clearTimeout(timer);})();}
process.on('SIGTERM',()=>{stopping=true;void stop();});process.on('SIGINT',()=>{stopping=true;void stop();});
while(!stopping){
 try{
  const raw=await readFile(process.env.PONG_AGENT_MANIFEST,'utf8');const m=JSON.parse(raw);
  assert(m.rulesVersion===7&&m.chainId===10143&&/^0x[\da-f]{40}$/i.test(m.app));
  if(raw!==fingerprint||!child||child.exitCode!==null||child.signalCode!==null){await stop();if(stopping)break;fingerprint=raw;start();console.log(JSON.stringify({at:new Date().toISOString(),service:'agent-process',role,event:'started',app:m.app,epoch:m.epoch}));}
 }catch{console.error(JSON.stringify({at:new Date().toISOString(),service:'agent-process',role,error:'Deployment metadata unavailable; preserving the current process'}));}
 if(!stopping)await new Promise(resolve=>{const done=()=>{clearTimeout(timer);process.off('SIGTERM',done);resolve();};const timer=setTimeout(done,5000);process.once('SIGTERM',done);});
}
await stop();
