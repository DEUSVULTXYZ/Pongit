// One private browser request, admitted through the original operator journal.
// Never starts another fixture, changes a deadline or submits player commands.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {isAddress,type Address} from 'viem';
import {chainTools} from './independent-chain-tools';
import {retryOperatorContention} from '../shared/operator-contention';
import {readHubDelegation} from '../shared/rooms-hub';
import {validateAgentPoolManifest} from '../shared/agent-pool';
import {reusableAgentPoolAbi as poolAbi} from '../shared/abi-ReusableAgentPool';
import {agentChallengesAbi as queueAbi} from '../shared/abi-AgentChallenges';
import {AgentPoolReader,poolJson} from '../relayer/src/agents/pool-read';
import {agentMetrics} from '../relayer/src/agents/metrics';
import {measuredFetch} from '../shared/rpc-metrics';
assert.equal(process.env.PONG_FIVE_BROWSER_SEAT,'one-private-request');assert.equal(process.getuid?.(),1000);
const run=process.env.PONG_FIVE_BROWSER_RUN!;assert(/^[1-9]$/.test(run));
const deadline=Date.parse(process.env.PONG_FIVE_BROWSER_DEADLINE??'');assert(deadline>Date.now()&&deadline<Date.now()+25*60_000);
const r=JSON.parse(await readFile('/secrets/deployment.json','utf8'));
const m=validateAgentPoolManifest(JSON.parse(await readFile('/metadata/manifest.json','utf8')),(process.env.PONG_HUMAN_APPS??'').split(','));
assert(!m.enabled&&m.version===5&&m.pool===r.common.pool&&!r.continuation);
const path=`artifacts/reusable-candidate/browser-seat-${run}.json`,intentPath=`artifacts/reusable-candidate/browser-intent-${run}.json`;
const report:any={startedAt:new Date().toISOString(),deadline,passed:false,scope:'Private, one actual browser-owned challenge; no public release'};
await writeFile(path,poolJson(report),{flag:'wx'});
const save=async()=>{await writeFile(path+'.next',poolJson(report));await rename(path+'.next',path);};
const metrics=await agentMetrics('/diagnostics/reusable','browser-admission');
const t=await chainTools(r.prefix+':browser-seat-'+run,measuredFetch('monad'));
const reader=new AgentPoolReader(t.base,m,[]),wait=(ms=1000)=>new Promise(resolve=>setTimeout(resolve,ms));
const write=(id:string,to:Address,abi:any,method:string,args:readonly unknown[]=[])=>retryOperatorContention(()=>t.write(id,to,abi,method,args));
try{
 const block=await t.base.getBlock();
 for(const arena of m.arenas.slice(0,5)){
  const d=await readHubDelegation(t.base,m.hub,arena.app,block.number);
  assert(d.status===1&&d.epoch===1n&&d.batchIndex<2000n&&d.expiresAt>block.timestamp+1800n,'Original bounded epoch reserve');
 }
 assert.equal((await reader.live()).value.items.length,0,'Another trial is active');
 await write('open-pool',m.pool,poolAbi,'setAdmissions',[true]);
 await write('open-challenges',m.challenges,queueAbi,'setAdmissions',[true]);report.readyAt=new Date().toISOString();await save();
 let intent:any;
 while(Date.now()<deadline){try{intent=JSON.parse(await readFile(intentPath,'utf8'));break;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}await wait();}
 assert(intent&&isAddress(intent.player)&&[0,1].includes(intent.mode)&&Date.parse(intent.createdAt)>=Date.parse(report.readyAt),'Original browser-intent deadline');
 const request=(await reader.challenge(intent.player)).value.request;
 assert(request&&request.status===1&&request.mode===intent.mode&&request.id===intent.challengeId);
 report.player=intent.player;report.challengeId=request.id;report.mode=intent.mode;await save();
 await write('admit-one',m.pool,poolAbi,'admitChallenge');
 while(Date.now()<deadline){
  const current=(await reader.challenge(intent.player)).value.request;
  if(current?.ref){assert.equal(current.id,request.id);report.ref=current.ref;report.admittedAt=new Date().toISOString();await save();break;}
  await wait();
 }
 assert(report.ref,'Original admission deadline');
 while(Date.now()<deadline){const view=(await reader.match(report.ref)).value;if(view.result){report.result=view.result;await save();break;}await wait(2000);}
 assert(report.result?.status===3,'Original published-result deadline');report.passed=true;
}catch(e){report.error=String((e as any)?.shortMessage??(e as Error).message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,220);process.exitCode=1;}
finally{
 for(const [id,to,abi] of [['close-pool',m.pool,poolAbi],['close-challenges',m.challenges,queueAbi]] as const){
  try{await write(id,to,abi,'setAdmissions',[false]);report[id]=true;}catch{report.pendingReconciliation=true;process.exitCode=1;}
 }
 report.finishedAt=new Date().toISOString();await save();await t.close();await metrics();console.log(JSON.stringify({passed:report.passed,error:report.error}));
}
