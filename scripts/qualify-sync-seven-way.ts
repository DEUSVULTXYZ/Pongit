// Read-only evidence of two human games beside four house copies and one
// tournament fixture. Controllers remain in their existing bounded processes.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createPublicClient,http,type Address} from 'viem';
import {monadTestnet} from 'viem/chains';
import {WebSocket} from 'ws';
import {validateAgentPoolManifest} from '../shared/agent-pool';
import {AgentPoolReader,poolJson} from '../relayer/src/agents/pool-read';
import {createPoolObserver} from '../shared/agent-pool-observer';
import {publicIndependentManifest} from '../shared/independent';
import {independentRules} from '../shared/independent-rules';
import {EngineFeed} from '../shared/engine-feed';
import {EngineStream,type EngineState} from '../shared/engine-stream';
import {engineTransport} from '../shared/engine-transport';

assert.equal(process.env.PONG_SEVEN_WAY,'read-only-private');
const deadline=Date.parse(process.env.PONG_SEVEN_WAY_DEADLINE??'');
assert(deadline>Date.now()&&deadline<=Date.now()+20*60_000);
const agents=validateAgentPoolManifest(JSON.parse(await readFile('/metadata/manifest.json','utf8')));
const raw=JSON.parse(await readFile('/human-manifest.json','utf8'));
assert.equal(agents.pool.toLowerCase(),'0xdee98e3f7a0f0049244a8257a9cde304d909e5dc');
assert(!agents.enabled&&!agents.tournamentsEnabled&&agents.rulesVersion===16);
assert.equal(raw.production,false);assert.equal(raw.status,'sealed');
assert.equal(raw.lobby.toLowerCase(),'0xe4cdf97e582282879219d7a888f8cd0ae629bd31');
assert.equal(raw.hostedProvisioning,'owner-consent-v1');
const human=publicIndependentManifest(raw),rules=independentRules(human);
assert.equal(human.rulesVersion,14);assert.equal(human.hub.toLowerCase(),agents.hub.toLowerCase());
const base=createPublicClient({chain:monadTestnet,transport:http(process.env.RPC_URL,{retryCount:0,timeout:5000})});
const reader=new AgentPoolReader(base,agents,human.arenas.map(a=>a.app));
const out='/evidence/seven-way-1.json';
const report:any={startedAt:new Date().toISOString(),deadline,source:process.env.PONG_SOURCE_COMMIT,
 scope:'Actual hosted snapshots from seven independent games. Read-only sampled overlap; not browser rendering, latency acceptance or 24-hour availability.',samples:[],passed:false};
await writeFile(out,poolJson(report),{flag:'wx'});
const save=async()=>{await writeFile(out+'.next',poolJson(report));await rename(out+'.next',out);};
const wait=()=>new Promise(resolve=>setTimeout(resolve,500));
const stops:(()=>void)[]=[];
const readers:Array<{ref:{app:Address;epoch:string;id:string};read:()=>Promise<EngineState>}>=[];
async function optional(path:string){try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw e;}}
try{
 let copies:any,humans:any;
 while(Date.now()<deadline){
  copies=await optional('/agents-evidence/five-concurrent-4.json');
  humans=await optional('/human-evidence/events-live-1.json');
  if(copies?.finishedAt&&!copies.passed)throw Error('Concurrent controller fixture failed');
  if(humans?.finishedAt&&!humans.passed)throw Error('Human controller fixture failed');
  if(copies?.tournament&&copies.people?.length===4&&copies.people.every((p:any)=>p.ref)
   &&humans?.matches?.length===2&&humans.matches.every((m:any)=>m.playingAt))break;
  await wait();
 }
 assert(Date.now()<deadline,'Original reference acquisition deadline');
 assert.equal(copies.existingTournament,4);
 assert.deepEqual([...humans.matches.map((m:any)=>m.mode)].sort(),[0,1]);
 const refs=[copies.tournament,...copies.people.map((p:any)=>p.ref),...humans.matches];
 assert.equal(new Set(refs.map((r:any)=>r.app.toLowerCase())).size,7,'All seven games require independent arenas');
 for(const ref of refs.slice(0,5)){
  const observer=await createPoolObserver(agents,(await reader.match(ref)).value,url=>new WebSocket(url));
  stops.push(observer.watch(()=>{}),()=>observer.close());
  readers.push({ref,read:()=>observer.read(true)});
 }
 for(const row of humans.matches){
  const ref={app:row.app as Address,epoch:String(row.epoch),id:String(row.id)};
  const arena=human.arenas.find(a=>a.app.toLowerCase()===ref.app.toLowerCase());assert(arena?.node);
  const node=createPublicClient({transport:engineTransport(arena.node)});
  const [session,version]:any[]=await Promise.all([
   node.request({method:'interlude_session',params:[]} as any),
   node.readContract({address:arena.app,abi:rules.arena,functionName:'RULES_VERSION'}),
  ]);
  assert.equal(session.app.toLowerCase(),arena.app.toLowerCase());assert.equal(session.chainId,4242);
  assert.equal(String(session.epoch),ref.epoch);assert.equal(version,14n);
  const stream=new EngineStream(arena.node,arena.app,url=>new WebSocket(url) as any);
  const feed=new EngineFeed({app:arena.app,abi:rules.arena,node},stream);
  stops.push(feed.watch(BigInt(ref.id),()=>{}),()=>stream.stop());
  readers.push({ref,read:()=>feed.read(BigInt(ref.id),true)});
 }
 let first:any;
 while(Date.now()<deadline){
  const startedAt=Date.now();
  const samples=await Promise.all(readers.map(async r=>{
   const s=await r.read();assert.equal(s.id,BigInt(r.ref.id));
   return {ref:r.ref,phase:s.phase,pause:s.sync?.pause.status??0,time:String(s.state.t),revision:String(s.revision),observedAt:s.observedAt,readAt:Date.now()};
  }));
  const sample={startedAt,finishedAt:Date.now(),games:samples};report.samples.push(sample);await save();
  assert(samples.every(s=>s.phase<3),'A game finished before the required overlap was observed');
  const live=samples.every(s=>s.phase===2&&s.pause<2&&s.readAt-s.observedAt<=1000);
  if(!live){first=undefined;await wait();continue;}
  first??=sample;
  const interval=sample.startedAt-first.finishedAt;
  if(interval>=5000&&samples.every((s,i)=>BigInt(s.time)>BigInt(first.games[i].time))){
   report.overlapStart=first.finishedAt;report.overlapEnd=sample.startedAt;report.sampledOverlapMs=interval;
   report.passed=true;break;
  }
  await wait();
 }
 assert(report.passed,'No seven-way live progression within the original deadline');
}catch(e){report.error=String((e as Error).message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,200);process.exitCode=1;}
finally{for(const stop of stops)stop();report.finishedAt=new Date().toISOString();await save();console.log(poolJson({passed:report.passed,overlapMs:report.sampledOverlapMs,error:report.error}));}
