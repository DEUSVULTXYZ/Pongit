// Read-only public evidence. Browser drivers own their own bounded matches.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {createPublicClient,http,type Address} from 'viem';
import {monadTestnet} from 'viem/chains';
import {WebSocket} from 'ws';
import {validateAgentPoolManifest} from '../shared/agent-pool';
import {publicIndependentManifest} from '../shared/independent';
import {independentReader} from '../shared/independent-read';
import {independentRules} from '../shared/independent-rules';
import {reusableAgentPoolAbi as poolAbi} from '../shared/abi-ReusableAgentPool';
import {agentCatalogAbi as catalogAbi} from '../shared/abi-AgentCatalog';
import {createPoolObserver} from '../shared/agent-pool-observer';
import {AgentPoolReader,poolJson} from '../relayer/src/agents/pool-read';
import {EngineFeed} from '../shared/engine-feed';
import {EngineStream,type EngineState} from '../shared/engine-stream';
import {engineTransport} from '../shared/engine-transport';
import {NO_LEASE_HUB} from '../shared/hub-lease';

assert.equal(process.env.PONG_SEVEN_WAY,'read-only-public-responsive');
const run=process.env.PONG_SEVEN_WAY_RUN!;assert(/^[a-z0-9-]{1,50}$/.test(run));
const deadline=Date.parse(process.env.PONG_SEVEN_WAY_DEADLINE??'');assert(deadline>Date.now()&&deadline<=Date.now()+20*60_000);
const proof=JSON.parse(await readFile(process.env.PONG_RESPONSIVE_IMPORT_PROOF!,'utf8'));
assert(proof.passed&&proof.action==='verify-import'&&proof.sourcePool.toLowerCase()==='0x6b09eb398668cb38db5d3a7dd857c33a371ac308');
async function json(path:string){const r=await fetch('https://pongit.xyz/api/'+path,{signal:AbortSignal.timeout(8000)});assert(r.ok);return r.json();}
const agents=validateAgentPoolManifest(await json('agents/config'));
const human=publicIndependentManifest((await json('independent/config') as any).manifest);
assert(agents.enabled&&agents.tournamentsEnabled&&agents.rulesVersion===17&&agents.maxMatches===5&&agents.houseInstances==='official-v1');
assert.equal(agents.pool.toLowerCase(),proof.pool.toLowerCase());assert.equal(human.rulesVersion,18);
assert.equal(agents.hub.toLowerCase(),NO_LEASE_HUB.toLowerCase());assert.equal(human.hub.toLowerCase(),agents.hub.toLowerCase());
assert(agents.arenas.every(a=>!human.arenas.some(h=>a.app.toLowerCase()===h.app.toLowerCase())));
const base=createPublicClient({chain:monadTestnet,batch:{multicall:{wait:10,batchSize:8192}},transport:http('https://testnet-rpc.monad.xyz',{retryCount:0,timeout:8000})});
const reader=new AgentPoolReader(base,agents,human.arenas.map(a=>a.app)),rules=independentRules(human);
const directory='artifacts/qualification/seven-way-'+run;await mkdir(directory,{recursive:true});
const output=directory+'/report.json';
const report:any={startedAt:new Date().toISOString(),deadline,pool:agents.pool,lobby:human.lobby,passed:false,samples:[],
 scope:'Seven actual independent live games with four copies of one official archetype also playing a tournament. Read-only overlap; separate browser reports prove inputs and rendering.'};
await writeFile(output,poolJson(report),{flag:'wx'});
const save=async()=>{await writeFile(output+'.next',poolJson(report));await rename(output+'.next',output);};
const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms));
type Ref={chainId:10143;app:Address;epoch:string;id:string};
const readers:Array<{ref:Ref;read:()=>Promise<EngineState>}>=[],stops:Array<()=>void>=[];
try{
 let refs:Ref[]|undefined;
 while(Date.now()<deadline){
  const block=await base.getBlock(),read=independentReader(base,human,block.number);
  const lanes=await Promise.all([0,1,2,3,4].map(i=>base.readContract({address:agents.pool,abi:poolAbi,functionName:'laneRecord',args:[i],blockNumber:block.number})));
  const slots=await Promise.all([0n,1n].map(i=>read.lobby('slot',[i])));
  if(lanes.every(l=>l.ref.id>0n&&!l.captured)&&slots.every(id=>id>0n)){
   const humanRefs=await Promise.all(slots.map(async id=>{const [ticket,binding]=await read.lobby('ticketOf',[id]);
    assert.equal(binding.id,id);return {chainId:10143 as const,app:ticket.arena as Address,epoch:String(binding.epoch),id:String(id)};}));
   const rival=lanes[1].b;
   const copies=lanes.slice(1).every(l=>l.tournament===0n&&!l.ranked&&l.b===rival);
   const tournament=lanes[0].tournament>0n&&(lanes[0].a===rival||lanes[0].b===rival);
   const identity=await base.readContract({address:agents.catalog,abi:catalogAbi,functionName:'identity',args:[rival],blockNumber:block.number});
   if(copies&&tournament&&identity.house>0){
    refs=[...lanes.map(l=>({chainId:10143 as const,app:l.ref.arena,epoch:String(l.ref.epoch),id:String(l.ref.id)})),...humanRefs];
    assert.equal(new Set(refs.map(r=>r.app.toLowerCase())).size,7);
    assert.equal((await base.getBlock({blockNumber:block.number})).hash,block.hash);
    report.acquisition={at:new Date().toISOString(),block:String(block.number),hash:block.hash,archetype:rival,tournament:String(lanes[0].tournament),refs};await save();break;
   }
  }
  await delay(1500);
 }
 assert(refs,'Seven games with the same official archetype were not acquired within the original deadline');
 for(const ref of refs.slice(0,5)){
  const observer=await createPoolObserver(agents,(await reader.match(ref)).value,url=>new WebSocket(url));
  stops.push(observer.watch(()=>{}),()=>observer.close());readers.push({ref,read:()=>observer.read(true)});
 }
 for(const ref of refs.slice(5)){
  const arena=human.arenas.find(a=>a.app.toLowerCase()===ref.app.toLowerCase());assert(arena?.node);
  const node=createPublicClient({transport:engineTransport(arena.node)});
  const [session,version]:any[]=await Promise.all([node.request({method:'interlude_session',params:[]} as any),node.readContract({address:arena.app,abi:rules.arena,functionName:'RULES_VERSION'})]);
  assert.equal(session.app.toLowerCase(),ref.app.toLowerCase());assert.equal(session.chainId,4242);assert.equal(String(session.epoch),ref.epoch);assert.equal(version,18n);
  const stream=new EngineStream(arena.node,ref.app,url=>new WebSocket(url) as any),feed=new EngineFeed({app:ref.app,abi:rules.arena,node},stream);
  stops.push(feed.watch(BigInt(ref.id),()=>{}),()=>stream.stop());readers.push({ref,read:()=>feed.read(BigInt(ref.id),true)});
 }
 let first:any;
 while(Date.now()<deadline){
  const startedAt=Date.now();
  const games=await Promise.all(readers.map(async r=>{const s=await r.read();assert.equal(s.id,BigInt(r.ref.id));
   return {ref:r.ref,phase:s.phase,pause:s.sync?.pause.status??0,time:String(s.state.t),revision:String(s.revision),observedAt:s.observedAt,receivedAt:Date.now()};}));
  const sample={startedAt,finishedAt:Date.now(),games};report.samples.push(sample);await save();
  assert(games.every(g=>g.phase<3),'A game ended before sufficient overlap; preserve partial evidence');
  const live=games.every(g=>g.phase===2&&g.pause<2&&g.receivedAt-g.observedAt<=1000);
  if(!live){first=undefined;await delay(500);continue;}first??=sample;
  const overlap=startedAt-first.finishedAt;
  if(overlap>=30000&&games.every((g,i)=>BigInt(g.time)>BigInt(first.games[i].time))){report.passed=true;report.overlapMs=overlap;break;}
  await delay(500);
 }
 assert(report.passed,'No thirty-second seven-way live overlap within the original deadline');
}catch(e){report.error=String((e as any).shortMessage??(e as Error).message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,240);process.exitCode=1;}
finally{for(const stop of stops)stop();report.finishedAt=new Date().toISOString();await save();console.log(poolJson({output,passed:report.passed,overlapMs:report.overlapMs,error:report.error}));}
