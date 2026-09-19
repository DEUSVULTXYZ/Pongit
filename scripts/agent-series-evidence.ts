// Read-only evidence for the private series candidate. The deployment record
// contains an engine key; only explicitly selected public fields leave it.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {createPublicClient,http,keccak256,type Address} from 'viem';
import {monadTestnet} from 'viem/chains';
import {seriesAgentArenaAbi as arenaAbi} from '../shared/abi-SeriesAgentArena';
import {agentSeriesPoolAbi as poolAbi} from '../shared/abi-AgentSeriesPool';
import {agentCatalogAbi as catalogAbi} from '../shared/abi-AgentCatalog';
import {agentTournamentsAbi as bookAbi} from '../shared/abi-AgentTournaments';
import {readHubDelegation} from '../shared/rooms-hub';

const source=JSON.parse(await readFile(process.env.PONG_AGENT_SERIES_DEPLOYMENT!,'utf8'));
const protectedApps=(process.env.PONG_HUMAN_APPS??'').toLowerCase().split(',').filter(Boolean);
assert(protectedApps.length&&source.phase==='deployed-closed');
assert(source.arenas.length>=2&&source.arenas.length<=16);
const common={pool:source.common.pool as Address,hub:source.common.hub as Address,
 catalog:source.common.catalog as Address,tournaments:source.common.tournaments as Address};
let nextRead=0,lane:Promise<unknown>=Promise.resolve();
const pacedFetch:typeof fetch=(input,init)=>{
 const work=lane.then(async()=>{await new Promise(r=>setTimeout(r,Math.max(0,nextRead-Date.now())));nextRead=Date.now()+400;return fetch(input,init);});
 lane=work.catch(()=>{});return work;
};
const base=createPublicClient({chain:monadTestnet,batch:{multicall:{wait:15,batchSize:8192}},transport:http(process.env.RPC_URL,{retryCount:0,timeout:10000,fetchFn:pacedFetch})});
assert.equal(await base.getChainId(),10143);
const block=await base.getBlock();
const read=(address:Address,abi:any,functionName:string,args:readonly unknown[]=[])=>base.readContract({address,abi,functionName,args,blockNumber:block.number}) as Promise<any>;
const publicAdmissions=await read(common.pool,poolAbi,'publicAdmissions');
const arenas=await Promise.all((source.arenas as Array<{app:Address;runtimeHash:`0x${string}`}>).map(async a=>{
 assert(!protectedApps.includes(a.app.toLowerCase()));
 const [code,d,ids,binding,drained]=await Promise.all([
  base.getCode({address:a.app,blockNumber:block.number}),readHubDelegation(base,common.hub,a.app,block.number),
  read(common.pool,poolAbi,'assignedIds',[a.app]),read(a.app,arenaAbi,'boundMatch'),read(a.app,arenaAbi,'seriesDrained'),
 ]);
 assert(code&&keccak256(code)===a.runtimeHash);assert(ids.length<=32);
 const matches=await Promise.all((ids as bigint[]).map(async id=>{
  const [entry,[published,brainA,brainB],binding]=await Promise.all([
   read(common.pool,poolAbi,'record',[id]),read(a.app,arenaAbi,'resultFor',[id]),read(a.app,arenaAbi,'bindingFor',[id]),
  ]);
  assert.equal(entry.ref.id,id);assert.equal(entry.ref.arena.toLowerCase(),a.app.toLowerCase());
  assert.equal(binding.epoch,entry.ref.epoch);
  const captured=entry.captured?await read(common.pool,poolAbi,'result',[entry.ref]):null;
  // A publication can precede capture. Report the distinction rather than
  // labeling a progressing asynchronous observer inconsistent.
  const capturedMatchesPublication=!!captured&&captured.hash===published.hash&&captured.status===published.status;
  return{ref:entry.ref,mode:binding.mode,tournament:binding.tournament,fixture:entry.fixture,
   published,captured,capturedMatchesPublication,
   controllerDecisions:[Number(brainA>>192n&0xffffffffn),Number(brainB>>192n&0xffffffffn)],
   invalidControllerDecisions:[Number(brainA>>224n&0xffffffffn),Number(brainB>>224n&0xffffffffn)]};
 }));
 return{app:a.app,runtimeHash:a.runtimeHash,epoch:d.epoch,status:d.status,batches:d.batchIndex,
  expiresAt:d.expiresAt,releaseAt:d.stakeUnlockAt,currentId:binding.id,drained,matches};
}));
const count=await read(common.catalog,catalogAbi,'count');assert(count<=128n,'Page a larger public catalogue separately');
const catalogue=await Promise.all(Array.from({length:Number(count)},async(_,i)=>{
 const address=await read(common.catalog,catalogAbi,'at',[BigInt(i)]),identity=await read(common.catalog,catalogAbi,'identity',[address]);
 return{address,house:identity.house,creator:identity.creator,qualified:identity.qualified,codeHash:identity.codeHash};
}));
const tournamentCount=await read(common.tournaments,bookAbi,'count');
const tournament=tournamentCount?await read(common.tournaments,bookAbi,'tournament',[tournamentCount]):null;
assert.equal((await base.getBlock({blockNumber:block.number})).hash,block.hash,'Pinned evidence was reorganized');
const report={at:new Date().toISOString(),kind:'read-only-series-evidence',block:block.number,blockHash:block.hash,
 common,publicAdmissions,arenas,catalogue,tournamentCount,tournament,
 scope:'Current Monad publications and captures only. Not a passing availability, renewal, worst-case release, browser or 24-hour qualification.'};
const file=process.env.PONG_AGENT_SERIES_REPORT!;assert(file);await mkdir(dirname(file),{recursive:true});
const json=(v:unknown)=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x,2);
await writeFile(file,json(report)+'\n');
console.log(json({at:report.at,block:report.block,publicAdmissions,arenas:arenas.map(a=>({app:a.app,epoch:a.epoch,status:a.status,batches:a.batches,currentId:a.currentId,
 matches:a.matches.map(m=>({id:m.ref.id,mode:m.mode,publishedPhase:m.published.status,score:[m.published.scoreA,m.published.scoreB],captured:m.capturedMatchesPublication}))})),qualifiedModes:catalogue.map(a=>a.qualified)}));
