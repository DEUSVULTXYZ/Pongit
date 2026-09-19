// Real HTTP envelope test on the temporary VPS test container. Contract/writer
// responses are fault-injection fixtures; this is not hosted gameplay proof.
import assert from 'node:assert/strict';
import {encodeFunctionData,zeroHash,type Address} from 'viem';
import {agentChallengesAbi} from '../shared/abi-AgentChallenges';
import type {AgentPoolManifest} from '../shared/agent-pool';
import type {ChainOperation} from '../shared/independent';
import {poolOperationId,type PoolSignedCall} from '../shared/agent-pool-sponsor';
import {poolSponsorRoutes} from '../relayer/src/agents/pool-sponsor';
import {startPoolReadService} from '../relayer/src/agents/pool-server';
import type {AgentPoolReader} from '../relayer/src/agents/pool-read';
assert.equal(process.env.PONG_POOL_HTTP_TEST,'isolated-fixtures');
const addr=(n:number)=>`0x${n.toString(16).padStart(40,'0')}` as Address;
const manifest:AgentPoolManifest={version:2,chainId:10143,engineChainId:4242,rulesVersion:10,hub:addr(1),pool:addr(2),catalog:addr(3),tournaments:addr(4),ratings:addr(5),challenges:addr(6),qualifications:addr(11),family:addr(7),
 arenas:[8,9,10].map(n=>({app:addr(n),node:`https://arena-${n}.example`,runtimeHash:`0x${'a'.repeat(64)}`})),enabled:false,tournamentsEnabled:false,verifiedCapacity:0,qualificationEvidence:null,durationSeconds:300,overtimeSeconds:60,intervalSeconds:60,maxMatches:2};
const request:PoolSignedCall={to:manifest.challenges,data:encodeFunctionData({abi:agentChallengesAbi,functionName:'command',args:[addr(20),1,addr(21),1,0n,0n,200n,`0x${'ab'.repeat(65)}`]})};
const id=poolOperationId(request),rows=new Map<string,ChainOperation>();let admission=false,outage=false,enqueued=0;
const writer={get:async(key:string)=>{if(outage)throw Error('PRIVATE raw signature must not escape');return rows.get(key)??null;},
 enqueue:async(to:Address,data:PoolSignedCall['data'])=>{enqueued++;const op:ChainOperation={id:poolOperationId({to,data}),status:'queued'};rows.set(op.id,op);return op;}};
const reader={config:async()=>({revision:'one',value:{enabled:false}})} as unknown as AgentPoolReader;
const service=await startPoolReadService(reader,{host:'127.0.0.1',port:0,public:true,sponsor:poolSponsorRoutes(manifest,writer,async()=>admission)});
const info=service.server.address();assert(info&&typeof info==='object');const origin=`http://127.0.0.1:${info.port}`;
const checks:string[]=[];
const post=(body:unknown,headers={'content-type':'application/json'})=>fetch(`${origin}/agents/transactions`,{method:'POST',headers,body:typeof body==='string'?body:JSON.stringify(body)});
try{
 let response=await post(request);assert.equal(response.status,409);assert.equal((await response.json() as any).accepted,false);assert.equal(enqueued,0);
 admission=true;response=await post(request);assert.equal(response.status,202);assert.equal((await response.json() as any).id,id);assert.equal(enqueued,1);
 admission=false;response=await post(request);assert.equal(response.status,202);assert.equal(enqueued,1);
 rows.set(id,{id,status:'confirmed',hash:zeroHash});response=await fetch(`${origin}/agents/operations/${id}`);
 assert.equal(response.status,200);assert.equal((await response.json() as any).status,'confirmed');checks.push('closed admission recovers queued and confirmed intents without another enqueue');
 response=await fetch(`${origin}/agents/config`);assert.equal(response.status,503);
 response=await fetch(`${origin}/agents/operations/${zeroHash}`);assert.equal(response.status,404);
 checks.push('closed public views do not prevent operation reconciliation');
 for(const [body,type,status] of [[JSON.stringify(request),'text/plain',415],['{','application/json',400],[' '.repeat(6000),'application/json',413],
  [JSON.stringify({...request,to:addr(99)}),'application/json',400], [JSON.stringify({...request,value:'1'}),'application/json',400]] as const){
  response=await post(body,{'content-type':type});assert.equal(response.status,status);assert.equal((await response.json() as any).accepted,false);
 }
 checks.push('body bounds, JSON content type, allowlist and zero-value envelope');
 outage=true;response=await fetch(`${origin}/agents/operations/${id}`);assert.equal(response.status,503);
 const failed:any=await response.json();assert(!JSON.stringify(failed).includes('PRIVATE'));assert.equal(failed.accepted,undefined);assert.match(failed.requestId,/^[\da-f-]{36}$/i);
 checks.push('network errors retain uncertainty and redact payloads');
 console.log(JSON.stringify({passed:true,checks,synthetic:true,publicServicesChanged:false}));
}finally{await service.close();}
