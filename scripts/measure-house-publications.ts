// Read-only bounded experiment. It measures real engine progress/publications,
// not visual smoothness, continuous availability or a provider quota guarantee.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createPublicClient,type Address} from 'viem';
import {engineTransport} from '../shared/engine-transport';
import {readEngineSnapshot} from '../shared/engine-snapshot';
import {engineState} from '../shared/engine-stream';
import {reusableAgentArenaAbi as abi} from '../shared/abi-ReusableAgentArena';
import {agentPublicationHealth} from '../shared/agent-publication-health';
import {measuredFetch} from '../shared/rpc-metrics';
import {agentMetrics} from '../relayer/src/agents/metrics';
assert.equal(process.env.PONG_HOUSE_PUBLICATION_MEASUREMENT,'private-read-only');
const r=JSON.parse(await readFile('/secrets/deployment.json','utf8'));
const app=process.env.PONG_REUSABLE_CAPACITY_APP as Address;
assert(r.houseInstances==='official-v1'&&r.arenas.some((a:any)=>a.app===app));
const url=`https://il-${app.slice(2,18)}.fly.dev`,node=createPublicClient({transport:engineTransport(url)});
const run=process.env.PONG_HOUSE_INSTANCE_RUN??'1';assert(/^[1-9]$/.test(run));
const out=`artifacts/reusable-candidate/house-publication-rate-${run}.json`;
try{await readFile(out);throw Error('Preserve existing measurements');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
const finish=await agentMetrics('/diagnostics/reusable','publication-observer');
const report:any={startedAt:new Date().toISOString(),app,pool:r.common.pool,rows:[],complete:false,
 source:process.env.PONG_SOURCE_COMMIT,tickIntervalMs:1500,
 scope:'Ten-minute private actual engine sample. Single arena, non-identical opponents; no rendering or 24-hour verdict.'};
const save=async()=>{await writeFile(out+'.next',JSON.stringify(report,null,2));await rename(out+'.next',out);};
try{for(let i=0;i<=60;i++){
 const at=new Date().toISOString();
 try{
  const [epoch,id]=await node.readContract({address:app,abi,functionName:'currentAdmission'});
  const response=await measuredFetch('interlude')(url+'/health',{signal:AbortSignal.timeout(4000)});
  assert(response.ok);const health=agentPublicationHealth(await response.json(),app,epoch);
  const s=id?engineState(await readEngineSnapshot({app,abi,node},id),Date.now()):null;
  report.rows.push({at,id:String(id),...health,phase:s?.phase,revision:String(s?.revision??0n),
   mode:s?.state.mode,gameUs:String(s?.state.t??0n),clockUs:String(s?.clock??0n),score:s?[s.state.scoreA,s.state.scoreB]:null});
 }catch(e){report.rows.push({at,error:String((e as any)?.shortMessage??(e as Error).message).split('\n')[0].slice(0,160)});}
 await save();if(i<60)await new Promise(resolve=>setTimeout(resolve,10000));
 }report.complete=true;
}finally{report.finishedAt=new Date().toISOString();await save();await finish();console.log(JSON.stringify({report:out,complete:report.complete,samples:report.rows.length}));}
