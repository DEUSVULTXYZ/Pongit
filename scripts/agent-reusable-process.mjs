// Fixed entrypoints, no Docker socket. Keeper and engine share durable journals;
// an exit never starts a parallel signer or erases uncertain operations.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
const role=process.argv[2],entries={keeper:'scripts/agent-reusable-step.ts',engines:'scripts/agent-reusable-engines.ts',
 reader:'relayer/src/agents/pool-server.ts',sponsor:'relayer/src/agents/pool-sponsor-server.ts'};
assert(Object.hasOwn(entries,role),'Unknown reusable service role');assert.equal(process.getuid?.(),1000);
let stopped=false,child,wake,killTimer,failures=0;
function stop(){stopped=true;wake?.();if(child&&child.exitCode===null&&child.signalCode===null){const target=child;target.kill('SIGTERM');killTimer=setTimeout(()=>target.kill('SIGKILL'),55000);}}
process.once('SIGTERM',stop);process.once('SIGINT',stop);
while(!stopped){
 const start=Date.now();
 const code=await new Promise(resolve=>{child=spawn(process.execPath,['--import','tsx',entries[role]],{stdio:'inherit'});child.once('exit',resolve);child.once('error',()=>resolve(1));});
 clearTimeout(killTimer);child=undefined;if(stopped)break;
 failures=code===0||Date.now()-start>60000?0:Math.min(failures+1,5);
 // A batched keeper step now costs a few RPC round trips, so a shorter pause
 // reacts to new challenges and captures sooner without raising request volume.
 const delay=failures?Math.min(30000,1000*2**failures):role==='keeper'?2000:1000;
 if(code!==0)console.error(JSON.stringify({at:new Date().toISOString(),service:'agent-reusable-process',role,event:'role-restarting',delayMs:delay}));
 await new Promise(resolve=>{const timer=setTimeout(resolve,delay);wake=()=>{clearTimeout(timer);resolve();};});wake=undefined;
}
