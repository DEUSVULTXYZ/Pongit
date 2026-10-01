// Bounded private catalogue window. Actual API/contract gates, no mocked
// availability or score. The two browser challenges own their ordinary results.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {keccak256,toHex} from 'viem';
import {chainTools} from './independent-chain-tools';
import {retryOperatorContention} from '../shared/operator-contention';
import {reusableAgentPoolAbi as poolAbi} from '../shared/abi-ReusableAgentPool';
import {agentChallengesAbi as queueAbi} from '../shared/abi-AgentChallenges';
import {AgentPoolReader,poolJson} from '../relayer/src/agents/pool-read';
import {validateAgentPoolManifest} from '../shared/agent-pool';
import {NO_LEASE_HUB} from '../shared/hub-lease';
import {agentMetrics} from '../relayer/src/agents/metrics';
import {measuredFetch} from '../shared/rpc-metrics';

assert.equal(process.env.PONG_PRIVATE_CATALOGUE,'two-private-browser-matches');
assert.equal(process.getuid?.(),1000);
const deadline=Date.parse(process.env.PONG_PRIVATE_CATALOGUE_DEADLINE??'');
assert(deadline>Date.now()&&deadline<Date.now()+20*60_000);
const r=JSON.parse(await readFile('/secrets/deployment.json','utf8'));
const m=validateAgentPoolManifest(JSON.parse(await readFile('/metadata/manifest.json','utf8')));
assert(!m.enabled&&!m.tournamentsEnabled&&!r.continuation);
assert.equal(m.pool.toLowerCase(),'0x550ff3c22e20fc760af9afd68fba2cb531140dc6');
assert.equal(m.hub.toLowerCase(),NO_LEASE_HUB.toLowerCase());
const root='artifacts/reusable-candidate',file=root+'/catalogue-window-1.json';
const proofBytes=await readFile(root+'/five-concurrent-2.json');
const proof=JSON.parse(proofBytes.toString());
assert(proof.passed&&proof.pool===m.pool&&proof.people.length===4&&proof.people.every((p:any)=>p.moves===100&&p.result?.status===3));
const evidence=keccak256(toHex(proofBytes));
const report:any={startedAt:new Date().toISOString(),deadline,pool:m.pool,evidence,requests:[],passed:false,
 scope:'Isolated catalogue/browser qualification only. No public migration or 24-hour qualification.'};
await writeFile(file,poolJson(report),{flag:'wx'});
const save=async()=>{await writeFile(file+'.next',poolJson(report));await rename(file+'.next',file);};
const t=await chainTools(r.prefix+':catalogue-window-1',measuredFetch('monad'));
const reader=new AgentPoolReader(t.base,m,[]);
const metrics=await agentMetrics('/diagnostics/reusable','catalogue-window');
const write=(id:string,to:any,abi:any,fn:string,args:any[]=[])=>retryOperatorContention(()=>t.write(id,to,abi,fn,args));
const read=(to:any,abi:any,fn:string,args:any[]=[])=>t.base.readContract({address:to,abi,functionName:fn,args}) as Promise<any>;
try{
 assert.equal(await read(m.pool,poolAbi,'admissions'),false);
 assert.equal(await read(m.pool,poolAbi,'publicAdmissions'),false);
 assert.equal((await reader.live()).value.items.length,0);
 const baseline=await read(m.challenges,queueAbi,'count');report.baseline=String(baseline);
 await write('capacity',m.pool,poolAbi,'qualifyCapacity',[evidence]);
 await write('pool-open',m.pool,poolAbi,'setAdmissions',[true]);
 await write('queue-open',m.challenges,queueAbi,'setAdmissions',[true]);
 await write('browser-open',m.pool,poolAbi,'setPublicAdmissions',[true]);
 report.readyAt=new Date().toISOString();await save();
 while(Date.now()<deadline){
  const count=await read(m.challenges,queueAbi,'count');assert(count<=baseline+2n,'Unexpected private browser request');
  for(let id=baseline+1n;id<=count;id++){
   const request=await read(m.challenges,queueAbi,'requests',[id]);
   let row=report.requests.find((p:any)=>p.id===String(id));
   if(!row){row={id:String(id),player:request[0],mode:request[2]};report.requests.push(row);}
   if(!row.ref){const value=(await reader.challenge(request[0])).value.request;if(value?.ref)row.ref=value.ref;}
   if(row.ref&&!row.result)row.result=(await reader.match(row.ref)).value.result;
   assert(!row.result||row.result.status===3,'Cancelled browser match is failed evidence');
  }
  report.observedAt=new Date().toISOString();await save();
  if(report.requests.length===2&&report.requests.every((p:any)=>p.result?.status===3)){
   assert.deepEqual(report.requests.map((p:any)=>p.mode).sort(),[0,1]);report.passed=true;break;
  }
  await new Promise(resolve=>setTimeout(resolve,1500));
 }
 assert(report.passed,'Original private catalogue deadline');
}catch(e){report.error=String((e as any).shortMessage??(e as Error).message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,220);process.exitCode=1;}
finally{
 for(const [id,to,abi,fn] of [['public-close',m.pool,poolAbi,'setPublicAdmissions'],['pool-close',m.pool,poolAbi,'setAdmissions'],['queue-close',m.challenges,queueAbi,'setAdmissions']] as const){
  try{await write(id,to,abi,fn,[false]);report[id]=true;}catch{report.pendingReconciliation=true;process.exitCode=1;}
 }
 report.finishedAt=new Date().toISOString();await save();await t.close();await metrics();
 console.log(JSON.stringify({passed:report.passed,error:report.error}));
}
