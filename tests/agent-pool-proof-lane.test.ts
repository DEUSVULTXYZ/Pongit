import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PoolProofLane} from '../relayer/src/agents/pool-proof-lane';

test('ready proof waits for the existing tick without competing for its nonce',async()=>{
 let tick=true,release:()=>void=()=>{},sent=0;
 const lane=new PoolProofLane(()=>0,()=>new Promise<void>(resolve=>{release=resolve;}));
 const actor={busy:()=>tick,read:async()=>({id:1n,phase:2,revision:7n,chaos:{request:8n,pending:0n}}),
  send:async(operation:string,_action:string,args:readonly unknown[])=>{assert(!tick);assert(lane.blocksTick());assert.equal(operation,'proof:8:7');assert.deepEqual(args,[1n,8n,'0x1234']);sent++;}};
 const task=lane.submit(actor,1n,8n,'0x1234');assert(lane.blocksTick());assert.equal(sent,0);
 tick=false;release();await task;assert.equal(sent,1);assert(!lane.blocksTick());
});

test('result or changed request while waiting discards proof without signing',async()=>{
 for(const change of [{id:2n},{phase:3},{chaos:{request:9n,pending:0n}},{chaos:{request:8n,pending:1n}}]){
  let tick=true,release:()=>void=()=>{};
  const lane=new PoolProofLane(()=>0,()=>new Promise<void>(resolve=>{release=resolve;}));
  const actor={busy:()=>tick,read:async()=>({id:1n,phase:2,revision:7n,chaos:{request:8n,pending:0n},...change}),send:async()=>assert.fail('No obsolete proof may be signed')};
  const task=lane.submit(actor,1n,8n,'0x1234');tick=false;release();await task;assert(!lane.blocksTick());
 }
});

test('timeout and send failure release proof priority without swallowing uncertainty',async()=>{
 let now=0;const lane=new PoolProofLane(()=>now,async()=>{now+=10_000;});
 const actor={busy:()=>true,read:async()=>({id:1n,phase:2,revision:7n,chaos:{request:8n,pending:0n}}),send:async()=>{throw Error('Exact command response lost');}};
 await assert.rejects(lane.submit(actor,1n,8n,'0x1234'),{code:'POOL_PROOF_WAIT'});assert(!lane.blocksTick());
 actor.busy=()=>false;await assert.rejects(lane.submit(actor,1n,8n,'0x1234'),/Exact command response lost/);assert(!lane.blocksTick());
});
