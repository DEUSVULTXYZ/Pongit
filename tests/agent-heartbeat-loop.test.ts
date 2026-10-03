import {test} from 'node:test';import assert from 'node:assert/strict';
import {agentHeartbeatLoop} from '../shared/agent-heartbeat-loop';
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function clock(){let tick=()=>{},cleared=false;return{every:(fn:()=>void,ms:number)=>{assert.equal(ms,200);tick=fn;return 1;},clear:(id:unknown)=>{assert.equal(id,1);cleared=true;},tick:()=>tick(),cleared:()=>cleared};}
test('first eligible heartbeat does not wait for another 200ms timer',async()=>{
 const c=clock();let calls=0;const loop=agentHeartbeatLoop(async()=>{calls++;},()=>true,()=>assert.fail('Unexpected error'),c);
 try{await turn();assert.equal(calls,1);}finally{await loop.stop();}
});
test('readiness can trigger a pulse while visibility and fresh perception remain required',async()=>{
 const c=clock();let visible=false,fresh=true,calls=0;const loop=agentHeartbeatLoop(async()=>{calls++;},()=>visible&&fresh,()=>assert.fail('Unexpected error'),c);
 try{await turn();assert.equal(calls,0);visible=true;loop.poke();await turn();assert.equal(calls,1);fresh=false;c.tick();await turn();assert.equal(calls,1);}finally{await loop.stop();}
});
test('slow command owns the only pulse and stop waits without sending a replacement',async()=>{
 const c=clock();let resolve!:()=>void,calls=0;const loop=agentHeartbeatLoop(()=>{calls++;return new Promise<void>(r=>{resolve=r;});},()=>true,()=>assert.fail('Unexpected error'),c);
 loop.poke();await turn();c.tick();loop.poke();await turn();assert.equal(calls,1);
 let stopped=false;const stopping=loop.stop().then(()=>{stopped=true;});await turn();assert.equal(stopped,false);assert(c.cleared());
 resolve();await stopping;c.tick();loop.poke();await turn();assert.equal(calls,1);
});
test('late rejection after stop does not change a replacement UI',async()=>{
 const c=clock();let reject!:(e:Error)=>void,errors=0;const loop=agentHeartbeatLoop(()=>new Promise((_,r)=>{reject=r;}),()=>true,()=>{errors++;},c);
 loop.poke();await turn();const stopping=loop.stop();reject(Error('Network unavailable'));await stopping;assert.equal(errors,0);
});
test('stop before the scheduled microtask prevents an unsent pulse',async()=>{
 const c=clock();let calls=0;const loop=agentHeartbeatLoop(async()=>{calls++;},()=>true,()=>assert.fail('Unexpected error'),c);
 await loop.stop();assert.equal(calls,0);
});
