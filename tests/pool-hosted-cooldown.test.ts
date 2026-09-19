import {test} from 'node:test';import assert from 'node:assert/strict';
import {provisionPoolArena} from '../relayer/src/agents/pool-hosted';
test('hosted cooldown exposes its actual deadline and sends no control-plane request',async()=>{
 const at=Date.now()+10000;let network=0,released=false;
 const connection={query:async(sql:string)=>{
  if(sql.startsWith('SELECT pg_try'))return{rows:[{ok:true}]};
  if(sql.startsWith('SELECT provision_epoch'))return{rows:[{provision_epoch:'2',provisioning:{state:'confirmed',at:Date.now(),attempts:1,retryAt:at}}]};
  return{rows:[]};
 },release(){released=true;}};
 const db={connect:async()=>connection} as any;
 await assert.rejects(provisionPoolArena(db,'0x0000000000000000000000000000000000000001',2n,undefined,(async()=>{network++;throw Error('unexpected request');}) as typeof fetch),
  (e:any)=>e.code==='AGENT_HOSTED_COOLDOWN'&&e.retryAt===at);
 assert.equal(network,0);assert(released);
});
