// Real PostgreSQL and HTTP, synthetic public states. No engine or operator key.
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {zeroHash,zeroAddress,type Address} from 'viem';
import {PoolReplays,initializePoolReplays,poolReplayKey,type RetentionRecord} from '../relayer/src/agents/pool-replays';
import {startPoolReadService} from '../relayer/src/agents/pool-server';
import type {AgentPoolReader} from '../relayer/src/agents/pool-read';
import type {AgentMatchRef} from '../shared/agents';
import type {EngineState} from '../shared/engine-stream';
import type {PoolMatchView} from '../shared/agent-pool';
import {initial} from '../shared/physics-v2';
import {restoreEngineFrame} from '../shared/engine-frame-json';
const connectionString=process.env.AGENT_DATABASE_URL!;assert.equal(new URL(connectionString).pathname,'/pool_replay_check');
const db=new Pool({connectionString}),addr=(n:number)=>`0x${n.toString(16).padStart(40,'0')}` as Address;
const a=addr(1),b=addr(2),ref:AgentMatchRef={chainId:10143,app:addr(3),epoch:'1',id:'1'};
const state=(r=ref,revision=1n,t=0n,phase=2,reset=false):EngineState=>({id:BigInt(r.id),revision,phase,reset,a,b,target:zeroAddress,winner:phase===3?a:zeroAddress,
 head:revision,clock:t,nonceA:0n,nonceB:0n,deadline:0n,observedAt:0,state:{...initial(zeroHash),t,scoreA:phase===3?7:0,scoreB:0,finished:phase===3}});
const view=(r=ref):PoolMatchView=>({ref:r,a,b,mode:0,ranked:false,tournament:'0',lane:1,node:null,currentBinding:false,regulationSeconds:300,overtimeSeconds:0,
 result:{hash:`0x${'a'.repeat(64)}`,winner:a,status:3,scoreA:7,scoreB:0,elapsedUs:'300000',finality:false}});
const index=new Map<string,RetentionRecord>();let offline=false;
const retention=async(ids:string[])=>{if(offline)throw Error('Index unavailable');return ids.flatMap(id=>index.has(id)?[index.get(id)!]:[]);};
const indexed=(r=ref)=>index.set(poolReplayKey(r),{id:poolReplayKey(r),playerA:a,playerB:b,status:3,scoreA:7,scoreB:0,replayAvailability:'available'});
let replay=new PoolReplays(db,retention),server:Awaited<ReturnType<typeof startPoolReadService>>|undefined;
const checks:string[]=[];
try{
 await initializePoolReplays(db);await db.query('TRUNCATE agent_pool.replay_frames,agent_pool.replays');
 replay.capture(ref,11,state());replay.capture(ref,11,state(ref,2n,100000n));replay.capture(ref,11,state(ref,3n,300000n,3));await replay.flush();
 assert.equal((await replay.read(view())).availability,'indexing');
 indexed();let result=await replay.read(view());assert.equal(result.availability,'available');assert.equal(result.frames.length,3);
 assert.equal(restoreEngineFrame(result.frames[2]).state.scoreA,7);checks.push('published-and-indexed-result-required','bounded-compressed-roundtrip');
 replay=new PoolReplays(db,retention);assert.equal((await replay.read(view())).frameCount,3);checks.push('restart-preserves-replay');
 const other={...ref,epoch:'2'},foreign={...ref,app:addr(4)};
 for(const r of [other,foreign]){
  indexed(r);replay.capture(r,11,state(r));replay.capture(r,11,state(r,2n,200000n));replay.capture(r,11,state(r,3n,300000n));await replay.flush();
  replay.capture(r,11,state(r,2n,100000n,2,true));replay.capture(r,11,state(r,4n,300000n,3));await replay.flush();
  result=await replay.read(view(r));assert.equal(result.availability,'available');assert.deepEqual(result.frames.map((s:any)=>s.revision),['1','2','4']);
 }
 assert.equal((await replay.read(view())).frames.length,3);checks.push('app-and-epoch-isolation','rollback-removes-divergent-frames');
 offline=true;await assert.rejects(replay.read(view()),/Index unavailable/);offline=false;
 assert.equal((await replay.read(view())).availability,'available');checks.push('index-outage-never-prunes');
 const corrected=view();corrected.result={...corrected.result!,hash:`0x${'b'.repeat(64)}`};
 assert.equal((await replay.read(corrected)).availability,'corrected');assert.equal((await replay.read(view())).availability,'available');checks.push('changed-result-hides-stale-recording');
 const late={...ref,id:'2'};indexed(late);replay.capture(late,11,state(late,2n,250000n));replay.capture(late,11,state(late,3n,300000n,3));await replay.flush();
 assert.equal((await replay.read(view(late))).availability,'partial');checks.push('missed-start-labelled-partial');
 const lost={...ref,id:'3'};indexed(lost);let failures=0,breakOnce=true;
 const broken={query:db.query.bind(db),connect:async()=>{if(breakOnce){breakOnce=false;throw Error('Injected connection interruption');}return db.connect();}} as unknown as Pool;
 const recovery=new PoolReplays(broken,retention,()=>{failures++;});recovery.capture(lost,11,state(lost));await recovery.flush();
 recovery.capture(lost,11,state(lost,2n,100000n));recovery.capture(lost,11,state(lost,3n,300000n,3));await recovery.flush();
 assert.equal(failures,1);assert.equal((await recovery.read(view(lost))).availability,'partial');checks.push('lost-database-write-labelled-partial');
 const interrupted={...ref,id:'4'};indexed(interrupted);replay.capture(interrupted,11,state(interrupted));await replay.flush();
 await replay.resumeRecorder();replay.capture(interrupted,11,state(interrupted,2n,300000n,3));await replay.flush();
 assert.equal((await replay.read(view(interrupted))).availability,'partial');checks.push('recorder-restart-labels-interrupted-match');
 const reader={manifest:{rulesVersion:11},match:async(r:AgentMatchRef)=>{
  if(poolReplayKey(r)!==poolReplayKey(ref))throw Object.assign(Error('Wrong reference'),{status:404});
  return{value:view(),observedBlock:'1',observedHash:zeroHash,observedTimestamp:'1',revision:'result-v1'};
 }} as unknown as AgentPoolReader;
 server=await startPoolReadService(reader,{host:'127.0.0.1',port:0,public:false,replays:replay});
 const origin=`http://127.0.0.1:${(server.server.address() as {port:number}).port}`,url=`${origin}/agents/replay?app=${ref.app}&epoch=1&id=1`;
 const response=await fetch(url);assert.equal(response.status,200);assert.equal((await response.json()).availability,'available');
 assert.equal((await fetch(url,{headers:{'If-None-Match':response.headers.get('etag')!}})).status,304);
 assert.equal((await fetch(url.replace('epoch=1','epoch=99'))).status,404);checks.push('http-reference-validation-and-etag');
 index.get(poolReplayKey(ref))!.replayAvailability='pruned';await replay.reconcile(async r=>view(r));
 assert.equal((await replay.read(view())).availability,'pruned');assert.equal((await db.query('SELECT packed FROM agent_pool.replays WHERE ref=$1',[poolReplayKey(ref)])).rows[0].packed,null);
 assert.equal((await replay.read(view(other))).availability,'available');checks.push('shared-retention-prunes-once-preserves-other-epoch');
 // An old unavailable contract must not prevent the next recording from being
 // reconciled, even with more than one maintenance page outstanding.
 const waiting=Array.from({length:10},(_,i)=>({...ref,id:String(10+i)}));
 for(const r of waiting){indexed(r);replay.capture(r,11,state(r));replay.capture(r,11,state(r,2n,300000n,3));}await replay.flush();
 const seen=new Set<string>();
 const lookup=async(r:AgentMatchRef)=>{seen.add(r.id);if(r.id==='10')throw Error('Historical RPC unavailable');return view(r);};
 const maintenance=new PoolReplays(db,retention,()=>{});await maintenance.reconcile(lookup);await maintenance.reconcile(lookup);
 assert.equal(seen.size,10);assert.equal((await replay.read(view(waiting[9]))).availability,'available');
 checks.push('unavailable-old-record-does-not-starve-next-maintenance-page');
 console.log(JSON.stringify({passed:true,scope:'Isolated real PostgreSQL and HTTP; synthetic contract/index states',checks}));
}finally{await server?.close();await replay.flush();await db.end();}
