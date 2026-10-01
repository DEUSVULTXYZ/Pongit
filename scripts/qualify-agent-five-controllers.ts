// Four real private controller games. This does not qualify human controls,
// tournament concurrency, latency targets or the final 24-hour trial.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {Pool} from 'pg';
import {decodeEventLog,keccak256,stringToHex,type Abi,type Address} from 'viem';
import {chainTools} from './independent-chain-tools';
import {retryOperatorContention} from '../shared/operator-contention';
import {readHubDelegation} from '../shared/rooms-hub';
import {reusableAgentPoolAbi} from '../shared/abi-ReusableAgentPool';
import {agentPoolAdmissionAbi} from '../shared/agent-house-instances';
import {agentCatalogAbi} from '../shared/abi-AgentCatalog';
import {validateReusableRecord} from '../relayer/src/agents/reusable-runtime';
import {measuredFetch} from '../shared/rpc-metrics';
import {agentMetrics} from '../relayer/src/agents/metrics';
import {NO_LEASE_HUB,hubLeaseValid} from '../shared/hub-lease';

assert.equal(process.env.PONG_FIVE_CONTROLLER_TEST,'bounded-private-four');
const run=process.env.PONG_FIVE_CONTROLLER_RUN!;assert(/^[1-9]$/.test(run));
const requested=Number(process.env.PONG_FIVE_CONTROLLER_COUNT??4);assert(Number.isInteger(requested)&&requested>=1&&requested<=4);
const deadline=Date.parse(process.env.PONG_FIVE_CONTROLLER_DEADLINE??'');
assert(Number.isFinite(deadline)&&deadline>Date.now()&&deadline<Date.now()+30*60_000);
const r=JSON.parse(await readFile('/secrets/deployment.json','utf8'));
validateReusableRecord(r,(process.env.PONG_HUMAN_APPS??'').split(',').filter(Boolean));assert(r.maxMatches===5&&!r.continuation);
const prefix=r.prefix+':five-controllers-'+run,t=await chainTools(prefix,measuredFetch('monad'));
const metric=await agentMetrics('/diagnostics/reusable','five-qualification');
const db=new Pool({connectionString:process.env.AGENT_DATABASE_URL,max:2});
const abi:Abi=[...reusableAgentPoolAbi,...agentPoolAdmissionAbi];
const read=(fn:string,args:any[]=[])=>t.base.readContract({address:r.common.pool,abi,functionName:fn,args}) as Promise<any>;
const write=(op:string,fn:string,args:any[]=[])=>retryOperatorContention(()=>t.write(op,r.common.pool,abi,fn,args));
const path='artifacts/reusable-candidate/five-controllers-'+run+'.json';
await mkdir('artifacts/reusable-candidate',{recursive:true});
let report:any={startedAt:new Date().toISOString(),deadline,pool:r.common.pool,source:process.env.PONG_SOURCE_COMMIT,requested,matches:[],passed:false,
 scope:'Four private hosted controller games; not human controls, tournament concurrency, renewal reserve or full qualification'};
try{const previous=JSON.parse(await readFile(path,'utf8'));assert(!previous.finishedAt,'Preserve completed report');assert(previous.pool===report.pool&&previous.deadline===deadline&&(previous.requested??4)===requested);report=previous;}
catch(e){if((e as any).code!=='ENOENT')throw e;}
const save=async()=>{await writeFile(path+'.next',JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2));await rename(path+'.next',path);};
const wait=()=>new Promise(resolve=>setTimeout(resolve,2000));
try{
 await save();assert.equal(await read('publicAdmissions'),false);assert.equal((await read('laneRecord',[0])).ref.id,0n,'Tournament stays disabled during this trial');
 const v3=r.common.hub.toLowerCase()===NO_LEASE_HUB.toLowerCase();
 const offset=Number(process.env.PONG_FIVE_CONTROLLER_ARENA_OFFSET??0);
 assert(offset===0||offset===1&&v3&&r.common.pool.toLowerCase()==='0x550ff3c22e20fc760af9afd68fba2cb531140dc6','Only reviewed private v3 reserve arenas');
 const observations=await Promise.all(r.arenas.slice(offset,offset+(v3?requested:5)).map(async(a:any)=>{
  const d=await readHubDelegation(t.base,r.common.hub,a.app),now=(await t.base.getBlock()).timestamp;
  assert(d.status===1&&d.epoch===1n&&hubLeaseValid(r.common.hub,d.expiresAt,now,1200n)&&d.batchIndex<2000n,'Inspect epoch reserve before a bounded trial');
  const h=(await db.query("SELECT stage,detail FROM agent_pool.health WHERE app=$1 AND updated_at>now()-interval '20 seconds'",[a.app.toLowerCase()])).rows[0];
  assert(h&&['available','playing','awaiting-publication'].includes(h.stage)&&String(h.detail.epoch)===String(d.epoch),'Fresh verified hosted health required');
  return{app:a.app,epoch:d.epoch,baseBlock:d.baseBlock,batches:d.batchIndex};
 }));
 report.initial=observations;await save();
 await write('private-epoch-gates','setArenaAdmissions',[observations.map(a=>a.app),observations.map(a=>a.epoch),observations.map(()=>true),keccak256(stringToHex('BOUNDED_PRIVATE_FOUR_CONTROLLER_TRIAL'))]);
 await write('private-admissions','setAdmissions',[true]);
 for(let index=0;index<requested;index++){
  assert(Date.now()<deadline,'Original trial deadline reached');
  let row=report.matches[index];if(!row){row={index,operation:'qualification-'+index};report.matches.push(row);await save();}
  if(!row.ref){
   const tx=await write(row.operation,'admitQualification');
   const issued=tx.logs.filter(l=>l.address.toLowerCase()===r.common.pool.toLowerCase()).flatMap(l=>{
    try{const e=decodeEventLog({abi:reusableAgentPoolAbi,topics:l.topics,data:l.data});return e.eventName==='AdmissionIssued'?[e]:[];}catch{return[];}
   })[0] as any;
   assert(issued,'Expected exact admission receipt');const ticket=issued.args.ticket;
   row.ref={chainId:'10143',arena:ticket.arena,epoch:String(ticket.epoch),id:String(ticket.matchId)};row.hash=tx.transactionHash;row.admittedAt=new Date().toISOString();await save();
  }
 }
 assert.equal(new Set(report.matches.map((x:any)=>x.ref.arena.toLowerCase())).size,requested,'Controller lanes must use independent arenas');
 while(Date.now()<deadline){
  for(const row of report.matches){if(row.result)continue;
   const ref={...row.ref,chainId:10143n,epoch:BigInt(row.ref.epoch),id:BigInt(row.ref.id)};
   const record=await read('record',[ref]);
   if(record.captured){const result=await read('result',[ref]);assert.equal(result.status,3,'Canceled games fail qualification');
    const identities=await Promise.all([record.a,record.b].map(address=>t.base.readContract({address:r.common.catalog,abi:agentCatalogAbi,functionName:'identity',args:[address]})));
    assert(identities.every(i=>i.qualified&(1<<result.mode)),'Published controller did not qualify');row.result=result;row.capturedAt=new Date().toISOString();row.qualified=identities.map(i=>i.qualified);
   }
  }
  report.lastObservedAt=new Date().toISOString();await save();if(report.matches.every((x:any)=>x.result))break;await wait();
 }
 assert(report.matches.every((x:any)=>x.result),'Real games did not finish and publish by their original deadline');report.passed=true;
}catch(e){report.error=String((e as any)?.shortMessage??(e as Error).message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,250);process.exitCode=1;}
finally{
 // No autonomous admission role is started. Closing this gate does not stop
 // current games, observations, result capture or reconciliation.
 try{await write('stop-private-admissions','setAdmissions',[false]);report.admissionsClosed=true;}
 catch{report.admissionsClosed=false;report.pendingReconciliation=true;process.exitCode=1;}
 report.finishedAt=new Date().toISOString();await save();await db.end();await t.close();await metric();
 console.log(JSON.stringify({passed:report.passed,admissionsClosed:report.admissionsClosed,matches:report.matches.length,error:report.error}));
}
