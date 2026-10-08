import test from 'node:test';
import assert from 'node:assert/strict';
import type {IndependentManifest} from '../shared/independent';
import {readAdmissionProposals} from '../relayer/src/independent-admission-observation';
const manifest={rulesVersion:18,lobby:`0x${'12'.repeat(20)}`,arenas:[]} as unknown as IndependentManifest;

test('two simultaneous human proposals use one block and two parallel dependency waves',async()=>{
 const started:string[]=[],pending:Array<()=>void>=[];
 let headers=0;
 const base:any={getBlock:async()=>{headers++;return{number:42n};},readContract:async(c:any)=>{
  assert.equal(c.blockNumber,42n);started.push(c.functionName+':'+c.args[0]);
  await new Promise<void>(resolve=>pending.push(resolve));
  return c.functionName==='slot'?BigInt(c.args[0])+91n:c.functionName==='proposal'?{status:2}:`0x${'00'.repeat(20)}`;
 }};
 const result=readAdmissionProposals(base,manifest);
 await new Promise<void>(r=>setImmediate(r));assert.deepEqual(started,['slot:0','slot:1']);
 pending.splice(0).forEach(r=>r());await new Promise<void>(r=>setImmediate(r));
 assert.deepEqual(started.slice(2),['proposal:91','arenaOf:91','proposal:92','arenaOf:92']);
 pending.splice(0).forEach(r=>r());const entries=await result;
 assert.equal(headers,1);assert.deepEqual(entries.map(p=>[p.id,p.block,p.proposal.status]),[[91n,42n,2],[92n,42n,2]]);
});

test('empty slots do not create proposals and an uncertain read propagates before any admission',async()=>{
 const base:any={getBlock:async()=>({number:9n}),readContract:async(c:any)=>{assert.equal(c.functionName,'slot');return 0n;}};
 assert.deepEqual(await readAdmissionProposals(base,manifest),[]);
 base.readContract=async()=>{throw Error('canonical read unavailable');};
 await assert.rejects(readAdmissionProposals(base,manifest),/canonical read unavailable/);
});
