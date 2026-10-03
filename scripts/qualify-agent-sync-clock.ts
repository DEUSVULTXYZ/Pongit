// Read-only wall/physics-clock evidence. This never drives gameplay or measures
// browser paint. Point boundaries and intentional pauses delimit rally spans.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createPublicClient,http} from 'viem';
import {monadTestnet} from 'viem/chains';
import {WebSocket} from 'ws';
import {AgentPoolReader,poolJson} from '../relayer/src/agents/pool-read';
import {validateAgentPoolManifest} from '../shared/agent-pool';
import {createPoolObserver} from '../shared/agent-pool-observer';
import type {EngineState} from '../shared/engine-stream';
import {PRIVATE_SYNC_PREDECESSOR,privateSyncContinuation,privateSyncQualification} from './private-sync-continuation';
assert.equal(process.env.PONG_SYNC_CLOCK,'read-only-private');
const scope=process.env.PONG_PRIVATE_SYNC_CONTINUATION;
const continuation=scope!==undefined;
const expected=continuation?privateSyncQualification(scope):undefined;
const tournament=Number(process.env.PONG_SYNC_CLOCK_TOURNAMENT);
assert(Number.isInteger(tournament)&&(expected?tournament>Number(expected.tournaments)&&tournament<=Number(expected.lastTournament):[1,2].includes(tournament)));
const attempt=Number(process.env.PONG_SYNC_CLOCK_ATTEMPT??1);assert(Number.isInteger(attempt)&&attempt>=1&&attempt<=3);
const m=validateAgentPoolManifest(JSON.parse(await readFile('/metadata/manifest.json','utf8')));
assert(m.rulesVersion===16&&!m.enabled&&!m.tournamentsEnabled);
if(continuation){
 const record=JSON.parse(await readFile('/metadata/reusable.json','utf8'));
 assert(privateSyncContinuation(record,scope));
 assert.equal(m.pool.toLowerCase(),record.common.pool.toLowerCase());
 assert(m.history?.some(p=>p.pool.toLowerCase()===expected!.pool));
}else assert.equal(m.pool.toLowerCase(),PRIVATE_SYNC_PREDECESSOR);
const base=createPublicClient({chain:monadTestnet,transport:http(process.env.RPC_URL,{retryCount:0,timeout:5000})});
const reader=new AgentPoolReader(base,m,[]),path=`artifacts/reusable-candidate/sync-clock-${tournament}${attempt===1?'':'-attempt'+attempt}.json`;
const deadline=Date.now()+360000;
const report:any={startedAt:new Date().toISOString(),deadline,scope:'Read-only hosted per-rally physical clock; not browser rendering or complete availability.',segments:[],gaps:[],errors:[],passed:false};
await writeFile(path,poolJson(report),{flag:'wx'});
const visited=new Set<string>();
try{
 while(Date.now()<deadline){
  const trial=JSON.parse(await readFile(`artifacts/reusable-candidate/five-tournament-${tournament}.json`,'utf8'));
  const row=trial.fixtures.find((f:any)=>!f.resolved&&!visited.has(String(f.ref.id)));
  if(!row){if(trial.finishedAt)break;await new Promise(r=>setTimeout(r,1000));continue;}
  const ref={chainId:10143 as const,app:row.ref.arena,epoch:String(row.ref.epoch),id:String(row.ref.id)};
  const view=(await reader.match(ref)).value;visited.add(ref.id);if(view.result)continue;
  const observer=await createPoolObserver(m,view,url=>new WebSocket(url));
  let first:{at:number;t:bigint;head:bigint;clock:bigint}|undefined,last:typeof first,rally='',revision=-1n,finished=false;
  const flush=()=>{
   if(first&&last&&last.at-first.at>=5000)report.segments.push({ref,rally,wallMs:last.at-first.at,physicalMs:Number(last.t-first.t)/1000,
    engineBlockMs:Number(last.head-first.head)*10,clockMs:Number(last.clock-first.clock)/1000,
    lagStartMs:Number(first.clock-first.t)/1000,lagEndMs:Number(last.clock-last.t)/1000});
   first=last=undefined;
  };
  const accept=(s:EngineState)=>{
   if(s.revision<=revision)return;revision=s.revision;
   const current=s.chaos?String(s.chaos.physics.score.rally):`${s.state.scoreA}:${s.state.scoreB}`;
   if(s.phase!==2||s.state.awaitingServe||(s.sync?.pause.status??0)>=2||current!==rally){flush();rally=current;}
   if(s.phase>=3){finished=true;return;}
   if(s.phase!==2||s.state.awaitingServe||(s.sync?.pause.status??0)>=2)return;
   const sample={at:performance.now(),t:s.state.t,head:s.head,clock:s.clock};
   if(last&&sample.at-last.at>500)report.gaps.push({ref,wallMs:sample.at-last.at,physicalMs:Number(sample.t-last.t)/1000});
   first??=sample;last=sample;
  };
  const stop=observer.watch(accept);
  try{while(Date.now()<deadline&&!finished){accept(await observer.read());await new Promise(r=>setTimeout(r,250));}}
  finally{flush();stop();observer.close();}
  await writeFile(path,poolJson(report));
 }
 report.wallMs=report.segments.reduce((n:number,s:any)=>n+s.wallMs,0);
 report.physicalMs=report.segments.reduce((n:number,s:any)=>n+s.physicalMs,0);
 report.engineBlockMs=report.segments.reduce((n:number,s:any)=>n+s.engineBlockMs,0);
 report.clockMs=report.segments.reduce((n:number,s:any)=>n+s.clockMs,0);
 report.ratio=report.wallMs?report.physicalMs/report.wallMs:null;
 report.passed=report.wallMs>=60000&&report.ratio>=.98&&report.ratio<=1.02;
 if(!report.passed)process.exitCode=1;
}catch(e){report.errors.push(String((e as Error).message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,180));process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await writeFile(path,poolJson(report));console.log(poolJson({passed:report.passed,wallMs:report.wallMs,ratio:report.ratio,segments:report.segments.length,errors:report.errors}));}
