// Read-only real Monad and HTTP qualification. Never loads an operator key.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createPublicClient,http,type Address} from 'viem';
import {monadTestnet} from 'viem/chains';
import {agentSeriesPoolAbi} from '../shared/abi-AgentSeriesPool';
import type {AgentPoolManifest} from '../shared/agent-pool';
import {AgentPoolReader,poolJson} from '../relayer/src/agents/pool-read';
import {startPoolReadService} from '../relayer/src/agents/pool-server';

const deployment=JSON.parse(await readFile(process.env.PONG_AGENT_SERIES_DEPLOYMENT!,'utf8'));
assert.equal(deployment.publiclyEnabled,false);assert.equal(deployment.rulesVersion,11);
assert.equal(deployment.indexBinding.pool,deployment.common.pool);
const m:AgentPoolManifest={version:3,chainId:10143,engineChainId:4242,rulesVersion:11,...deployment.common,
 arenas:deployment.arenas.map((a:any)=>({app:a.app,runtimeHash:a.runtimeHash,node:`https://il-${a.app.slice(2,18).toLowerCase()}.fly.dev`})),
 enabled:false,tournamentsEnabled:false,verifiedCapacity:0,qualificationEvidence:null,durationSeconds:300,overtimeSeconds:60,intervalSeconds:60,maxMatches:2};
const protectedApps=(process.env.PONG_HUMAN_APPS??'').split(',').filter(Boolean);assert(protectedApps.length);
let next=0,lane:Promise<unknown>=Promise.resolve();
const pacedFetch:typeof fetch=(input,init)=>{
 const task=lane.then(async()=>{await new Promise(r=>setTimeout(r,Math.max(0,next-Date.now())));next=Date.now()+400;return fetch(input,init);});
 lane=task.catch(()=>{});return task;
};
const base=createPublicClient({chain:monadTestnet,batch:{multicall:{wait:15,batchSize:8192}},transport:http(process.env.RPC_URL,{retryCount:0,timeout:15000,fetchFn:pacedFetch})});
const reader=new AgentPoolReader(base,m,protectedApps);
const service=await startPoolReadService(reader,{host:'127.0.0.1',port:0,public:false});
const port=(service.server.address() as {port:number}).port,origin=`http://127.0.0.1:${port}`;
const report:any={at:new Date().toISOString(),pool:m.pool,scope:'Actual Monad publications and private loopback HTTP; no game commands or public deployment',checks:[],passed:false};
try{
 const get=async(path:string)=>{const response=await fetch(origin+path);assert.equal(response.status,200,path);return response;};
 const catalogResponse=await get('/agents/catalog?limit=32'),catalog=await catalogResponse.json();
 assert.equal(catalog.items.filter((a:any)=>a.official).length,8);report.checks.push('eight-official-bots-over-http');
 const etag=catalogResponse.headers.get('etag');assert(etag);
 assert.equal((await fetch(origin+'/agents/catalog?limit=32',{headers:{'If-None-Match':etag}})).status,304);
 report.checks.push('versioned-http-cache');
 const top=await base.getBlockNumber(),ids=await Promise.all(m.arenas.map(a=>base.readContract({address:m.pool,abi:agentSeriesPoolAbi,functionName:'assignedIds',args:[a.app]})));
 const modes=new Set<number>();report.matches=[];
 for(let at=0;at<ids.length;at++)for(const id of ids[at]){
  const entry=await base.readContract({address:m.pool,abi:agentSeriesPoolAbi,functionName:'record',args:[id]});
  if(!entry.captured)continue;
  const path=`/agents/matches/${entry.ref.arena}/${entry.ref.epoch}/${id}`;
  const match=await(await get(path)).json();assert(match.result);assert.equal(match.node,null);assert.equal(match.ref.app.toLowerCase(),m.arenas[at].app.toLowerCase());
  assert.equal(match.ref.id,String(id));assert.equal(match.ref.epoch,String(entry.ref.epoch));assert.equal(match.result.status,3);modes.add(match.mode);
  report.matches.push({ref:match.ref,hash:match.result.hash,mode:match.mode,score:[match.result.scoreA,match.result.scoreB]});
 }
 assert(modes.has(0)&&modes.has(1),'Both completed modes must be published');report.checks.push('published-classic-chaos-and-no-false-live-node');
 const bad=await fetch(origin+`/agents/matches/${m.arenas[0].app}/999/1`);assert.equal(bad.status,404);report.checks.push('wrong-epoch-not-found');
 const logs:any[]=[];const archiveEvent=agentSeriesPoolAbi.find(e=>e.type==='event'&&e.name==='SeriesResultRecorded')!;assert.equal(archiveEvent.type,'event');
 // Match the direct RPC path's small history windows. The private indexer's
 // larger windows go through its chunking proxy and cannot be copied here.
 for(let from=BigInt(deployment.indexBinding.startBlock);from<=top;from+=100n){
  const to=from+99n<top?from+99n:top;
  logs.push(...await base.getLogs({address:m.pool as Address,event:archiveEvent as any,fromBlock:from,toBlock:to,strict:true}));
 }
 report.archives=report.matches.map((match:any)=>{
  const log=logs.find(e=>e.args.app.toLowerCase()===match.ref.app.toLowerCase()&&String(e.args.epoch)===match.ref.epoch&&String(e.args.id)===match.ref.id&&e.args.hash===match.hash);
  assert(log,'No actual Monad archive event for captured result');
  assert.equal(log.args.scoreA,match.score[0]);assert.equal(log.args.scoreB,match.score[1]);assert.equal(log.args.mode,match.mode);
  return{ref:match.ref,transaction:log.transactionHash,block:String(log.blockNumber),logIndex:log.logIndex};
 });report.checks.push('actual-series-archive-logs-match-publications');report.passed=true;
}catch(error){const e=error as {message:string;details?:string;code?:number};
 report.error=e.message.split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,220);
 report.details=e.details?.split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,220);report.code=e.code;process.exitCode=1;}
finally{await service.close();await writeFile(process.env.PONG_AGENT_SERIES_REPORT!,poolJson(report)+'\n');console.log(poolJson(report));}
