// Read-only paired actual canonical state. No session, signer or command writer.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createPublicClient,http,type PublicClient,type Address} from 'viem';
import {agentAssignments} from '../shared/agent-assignments';
import {hubObservations} from '../shared/hub-observation';
import {agentRuntimeObservations} from '../shared/agent-runtime-observations';
assert.equal(process.env.PONG_RUNTIME_READ_PROOF,'paired-private-canonical');
const m=JSON.parse(await readFile('/metadata/manifest.json','utf8'));
assert.equal(m.pool.toLowerCase(),'0x550ff3c22e20fc760af9afd68fba2cb531140dc6');
const apps=m.arenas.map((a:any)=>a.app) as Address[];
let requests=0;
const fetchFn:typeof fetch=async(...args)=>{requests++;return fetch(...args);};
const base=createPublicClient({transport:http(process.env.RPC_URL,{fetchFn,timeout:10000,retryCount:0})});
assert.equal(await base.getChainId(),10143);
const block=await base.getBlock();assert(block.hash);
// Count and actually send every header request, but pin them all to this number.
const pinned={...base,getBlock:async()=>{const b=await base.getBlock({blockNumber:block.number});assert.equal(b.hash,block.hash);return b;}} as unknown as PublicClient;
const report:any={startedAt:new Date().toISOString(),block:String(block.number),hash:block.hash,passed:false,samples:[],
 scope:'Same-block real planning and lifecycle reads, including actual header RPCs. Not a command/render/admission latency result.'};
const run=process.env.PONG_RUNTIME_READ_RUN??'1';assert(/^[1-9]$/.test(run));
const file=`/audit/runtime-read-pair-${run}.json`;await writeFile(file,JSON.stringify(report),{flag:'wx'});
try{
 let expected:unknown;
 const stable=(v:any):any=>typeof v==='bigint'?String(v):Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
 for(const kind of ['baseline','candidate','candidate','baseline','baseline','candidate'] as const){
  // This measurement isolates batch delivery cost; the real freshness guards
  // are separately tested against a advancing wall clock, not disabled in use.
  const now=()=>0;
  const old={assignments:agentAssignments(pinned,m.pool,m.maxMatches,now),hub:hubObservations(pinned,m.hub,apps,now)};
  const value=kind==='candidate'?agentRuntimeObservations(pinned,m.pool,m.hub,apps,m.maxMatches,now):old;
  requests=0;const began=performance.now();
  const [planning,...hubs]=await Promise.all([value.assignments.read(),...apps.map(a=>value.hub.read(a,true))]);
  const result=stable({planning,hubs});expected??=result;
  assert.deepEqual(result,expected,'Canonical assignments or lifecycle changed');
  const digest=createHash('sha256').update(JSON.stringify(result)).digest('hex');
  report.samples.push({kind,ms:performance.now()-began,rpcRequests:requests,digest});
 }
 assert.equal((await base.getBlock({blockNumber:block.number})).hash,block.hash);report.passed=true;
}catch(error){report.error=String((error as any).shortMessage??(error as Error).message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,220);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await writeFile(file,JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
