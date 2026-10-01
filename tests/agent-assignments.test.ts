import test from 'node:test';
import assert from 'node:assert/strict';
import type {PublicClient} from 'viem';
import {agentAssignments} from '../shared/agent-assignments';

test('all five arenas share one assignment batch; missed updates cannot stay cached beyond the admission bound',async()=>{
 let now=0,batches=0,head=50n,changed=false,reads=0;
 const pool='0x0000000000000000000000000000000000000001' as const;
 const base={getBlock:async()=>({number:head,hash:changed&&++reads>1?'0xb':'0xa'}),multicall:async(p:any)=>{
  batches++;assert.equal(p.blockNumber,head);assert.equal(p.allowFailure,false);assert.equal(p.batchSize,0);
  assert.deepEqual(p.contracts.map((c:any)=>c.args),[[0],[1],[2],[3],[4]]);return Array(5).fill(head);
 }} as unknown as PublicClient;
 const view=agentAssignments(base,pool,5,()=>now);
 await Promise.all(Array.from({length:5},()=>view.read()));assert.equal(batches,1);
 now=499;await view.read();assert.equal(batches,1);
 now=500;head=51n;await view.read();await new Promise(r=>setImmediate(r));assert.equal(batches,2);
 assert.equal((await view.read()).lanes[0],51n);
 now=2000;changed=true;await assert.rejects(view.read(),/changed during observation/);
 assert.throws(()=>agentAssignments(base,pool,99),/Unsupported/);
});
