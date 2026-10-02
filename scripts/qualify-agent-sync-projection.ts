// Read-only comparison against actual hosted frames. This checks the
// integrated controller/physics projection, not browser paint or player input.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createPublicClient,http} from 'viem';
import {monadTestnet} from 'viem/chains';
import {WebSocket} from 'ws';
import {validateAgentPoolManifest} from '../shared/agent-pool';
import {AgentPoolReader,poolJson} from '../relayer/src/agents/pool-read';
import {createPoolObserver} from '../shared/agent-pool-observer';
import {queuedDirections} from '../shared/agent-synchronization';
import {projectParticipant,projectChaosParticipant} from '../web/lib/participant-projection';
import type {EngineState} from '../shared/engine-stream';

assert.equal(process.env.PONG_SYNC_PROJECTION,'read-only-private');
const run=process.env.PONG_SYNC_PROJECTION_RUN;assert(run==='4'||run==='6');
const mode=run==='6'?1:0;
const m=validateAgentPoolManifest(JSON.parse(await readFile('/metadata/manifest.json','utf8')));
assert.equal(m.pool.toLowerCase(),'0xd47bc7fece722a237c6547f85b4dd91c2601a4c8');
assert(m.rulesVersion===16&&!m.enabled);
const base=createPublicClient({chain:monadTestnet,transport:http(process.env.RPC_URL,{retryCount:0})});
const reader=new AgentPoolReader(base,m,[]);
const trial=JSON.parse(await readFile(`artifacts/reusable-candidate/five-controllers-${run}.json`,'utf8'));
let view:Awaited<ReturnType<typeof reader.match>>['value']|undefined;
for(const row of trial.matches){
 if(!row.ref)continue;
 const ref={chainId:10143 as const,app:row.ref.arena,epoch:row.ref.epoch,id:row.ref.id};
 const candidate=(await reader.match(ref)).value;
 if(candidate.mode===mode&&!candidate.result){view=candidate;break;}
}
assert(view,'A real active fixture of the requested mode is required');
const path=`artifacts/reusable-candidate/sync-projection-${view.ref.id}.json`;
const report:any={startedAt:new Date().toISOString(),ref:view.ref,source:process.env.PONG_SOURCE_COMMIT,
 mode,scope:'Read-only hosted frame/controller projection; no browser, GPU, input, latency or 24-hour claim.',samples:[],errors:[],excludedReveals:0,passed:false};
await writeFile(path,poolJson(report),{flag:'wx'});
const observer=await createPoolObserver(m,view,url=>new WebSocket(url));
let previous:EngineState|undefined,finished=false;
let firstClock:{at:number;t:bigint}|undefined,lastClock:{at:number;t:bigint}|undefined;
const accept=(next:EngineState)=>{
 if(previous&&next.revision<=previous.revision)return;
 const prior=previous;previous=next;if(next.phase>=3)finished=true;
 if(next.phase===2){lastClock={at:performance.now(),t:next.state.t};firstClock??=lastClock;}
 if(!prior?.sync||prior.phase!==2||next.phase!==2||next.state.t<=prior.state.t||next.state.t-prior.state.t>600_000n
  ||prior.state.awaitingServe||next.state.awaitingServe||prior.state.scoreA!==next.state.scoreA||prior.state.scoreB!==next.state.scoreB)return;
 let errors:Record<string,number>;
 if(mode===1){
  assert(prior.chaos&&next.chaos);
  const a=prior.chaos.physics,b=next.chaos.physics;
  if(a.score.rally!==b.score.rally)return;
  // A future proof is not public at the prior observation. Report exclusions
  // explicitly instead of inserting the revealed outcome into the predictor.
  if(prior.chaos.request!==next.chaos.request||prior.chaos.pending!==next.chaos.pending
   ||b.effects.some(e=>e.serial>Math.max(...a.effects.map(v=>v.serial)))){report.excludedReveals++;return;}
  const predicted=projectChaosParticipant(a,b.t,queuedDirections(prior.sync.pendingControls),'complete',{...prior.sync,progressive:true});
  if(predicted.waiting)return;
  errors={left:Number(predicted.state.left-b.left)/1e12,right:Number(predicted.state.right-b.right)/1e12};
  for(let i=0;i<2;i++){
   assert.equal(predicted.state.balls[i].alive,b.balls[i].alive,'Projected ball identity differs');
   if(b.balls[i].alive)for(const key of ['x','y'] as const)errors[`ball${i}.${key}`]=Number(predicted.state.balls[i][key]-b.balls[i][key])/1e12;
  }
 }else{
  const predicted=projectParticipant(prior.state,next.state.t,queuedDirections(prior.sync.pendingControls),{...prior.sync,progressive:true});
  if(predicted.waiting)return;
  errors=Object.fromEntries((['x','y','left','right'] as const).map(key=>[key,Number(predicted.state[key]-next.state[key])/1e6]));
 }
 report.samples.push({revision:String(next.revision),from:String(prior.state.t),to:String(next.state.t),errors});
};
const stop=observer.watch(accept);
try{
 const end=Date.now()+120_000;
 while(Date.now()<end&&!finished){accept(await observer.read());await new Promise(r=>setTimeout(r,150));}
 report.maxError=Math.max(0,...report.samples.flatMap((s:any)=>Object.values(s.errors).map((v:any)=>Math.abs(v))));
 if(firstClock&&lastClock&&lastClock.at>firstClock.at){report.clock={wallMs:lastClock.at-firstClock.at,physicalMs:Number(lastClock.t-firstClock.t)/1000};report.clock.ratio=report.clock.physicalMs/report.clock.wallMs;}
 report.passed=report.samples.length>=50&&report.maxError<=.01;
 if(!report.passed)process.exitCode=1;
}catch(e){report.errors.push(String((e as Error).message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,200));process.exitCode=1;}
finally{stop();observer.close();report.finishedAt=new Date().toISOString();await writeFile(path,poolJson(report));console.log(poolJson({passed:report.passed,samples:report.samples.length,maxError:report.maxError,errors:report.errors,ref:view.ref}));}
