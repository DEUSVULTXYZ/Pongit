import {test} from 'node:test';
import assert from 'node:assert/strict';
import {zeroHash,type Address,type PublicClient} from 'viem';
import {AgentPoolReader} from '../relayer/src/agents/pool-read';
import {PoolReadCache,poolRoutes} from '../relayer/src/agents/pool-api';
import type {AgentPoolManifest} from '../shared/agent-pool';
const addr=(n:number)=>`0x${n.toString(16).padStart(40,'0')}` as Address;
const evidence=`0x${'b'.repeat(64)}` as const;
const manifest:AgentPoolManifest={version:2,chainId:10143,engineChainId:4242,rulesVersion:10,hub:addr(1),pool:addr(2),catalog:addr(3),tournaments:addr(4),ratings:addr(5),challenges:addr(6),qualifications:addr(11),family:addr(7),
 arenas:[8,9,10].map(n=>({app:addr(n),node:`https://arena-${n}.example`,runtimeHash:`0x${'a'.repeat(64)}`})),enabled:true,tournamentsEnabled:true,verifiedCapacity:2,qualificationEvidence:evidence,durationSeconds:300,overtimeSeconds:60,intervalSeconds:60,maxMatches:2};
test('published view pins all reads and rejects a mid-read reorganization',async()=>{
 let reads=0,reorg=false,second=false;
 const client={getBlock:async()=>({number:50n,hash:reorg&&second?'0xb':'0xa'}),readContract:async(r:any)=>{
  assert.equal(r.blockNumber,50n);reads++;second=true;
  if(r.functionName==='arenaPage')return manifest.arenas.map(a=>a.app);
  if(r.functionName==='capacityEvidence')return evidence;
  return true;
 }} as unknown as PublicClient;
 const reader=new AgentPoolReader(client,manifest);assert.equal((await reader.config()).value.enabled,true);assert.equal(reads,5);
 reorg=true;second=false;await assert.rejects(reader.config(),/changed during synchronization/);
});
test('a local enabled flag cannot bypass a missing or different on-chain qualification',async()=>{
 let proof:string=zeroHash,gate=false;
 const client={getBlock:async()=>({number:50n,hash:'0xa'}),readContract:async(r:any)=>{
  if(r.functionName==='arenaPage')return manifest.arenas.map(a=>a.app);
  if(r.functionName==='capacityEvidence')return proof;
  if(r.functionName==='publicAdmissions')return gate;
  return true;
 }} as unknown as PublicClient;
 const reader=new AgentPoolReader(client,manifest);assert.equal((await reader.config()).value.enabled,false);
 proof=evidence;assert.equal((await reader.config()).value.enabled,false);
 gate=true;assert.equal((await reader.config()).value.enabled,true);
 const disabled=new AgentPoolReader(client,{...manifest,enabled:false,tournamentsEnabled:false});assert.equal((await disabled.config()).value.enabled,false);
});
test('read cache coalesces concurrent spectators, retries failures and expires independently of traffic',async()=>{
 let now=0,calls=0;const cache=new PoolReadCache(()=>now,10,2);
 const load=async()=>++calls;
 assert.deepEqual(await Promise.all([cache.get('x',load),cache.get('x',load)]),[1,1]);
 now=9;await cache.get('x',load);now=11;assert.equal(await cache.get('x',load),2);
 await assert.rejects(cache.get('error',async()=>{throw Error('RPC unavailable');}),/unavailable/);
 assert.equal(await cache.get('error',load),3);
 await cache.get('y',load);assert.equal(await cache.get('x',load),5,'bounded eviction');
});
test('routes reject unbounded page requests without sending RPC',async()=>{
 let calls=0;const reader={tournament:async(id:bigint)=>{calls++;return id;},rankings:async(...args:any[])=>{calls++;return args;}} as unknown as AgentPoolReader;
 const route=poolRoutes(reader);for(const path of ['/catalog?limit=33','/catalog?offset=-1','/catalog?offset=999999999999999999999','/rankings?mode=2','/catalog?limit=0'])
  await assert.rejects(route(new URL(`http://localhost${path}`)));
 assert.equal(calls,0);assert.equal(await route(new URL('http://localhost/agents/tournaments/14')),14n);
 assert.deepEqual(await route(new URL('http://localhost/rankings?mode=1&block=50&offset=32&limit=8')),[1,32n,8,50n]);
});
test('slow reads stay single-flight beyond the TTL and cannot evict another pending read',async()=>{
 let now=0,resolve!:(n:number)=>void;const cache=new PoolReadCache(()=>now,10,1);
 const first=cache.get('x',()=>new Promise<number>(r=>{resolve=r;}));now=100;
 const second=cache.get('x',async()=>{throw Error('duplicate network call');});assert.equal(first,second);
 assert.throws(()=>cache.get('y',async()=>2),/busy/);resolve(1);assert.equal(await second,1);
 assert.equal(await cache.get('y',async()=>2),2);
});
