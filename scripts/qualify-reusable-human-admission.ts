// Bounded private admission fixture for real browser/financial tests. This is
// not a production publication budget or a continuously running coordinator.
// Match choice remains in assignNext(); only the existing service writes physics.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {zeroAddress,type Address} from 'viem';
import {chainTools} from './independent-chain-tools';
import {readHubDelegation} from '../shared/rooms-hub';
import {retryOperatorContention} from '../shared/operator-contention';
import {abi as lobbyAbi} from '../shared/abi-independent-ReusableEventsLobby';
import {abi as arenaAbi} from '../shared/abi-independent-ReusableEventsArena';
import {abi as hubAbi} from '../shared/abi-independent-IInterludeHub';
import {measuredFetch} from '../shared/rpc-metrics';
import {agentMetrics} from '../relayer/src/agents/metrics';

assert.equal(process.env.PONG_REUSABLE_HUMAN_ADMISSION_TEST,'bounded-private-qualification');
assert.equal(process.getuid?.(),1000);
const m=JSON.parse(await readFile(process.env.PONG_INDEPENDENT_MANIFEST!,'utf8'));
assert.equal(m.production,false);assert.equal(m.rulesVersion,14);assert.equal(m.status,'sealed');
const label=process.env.PONG_REUSABLE_ADMISSION_RUN!;assert(/^[a-z0-9-]{1,32}$/.test(label));
const existing=(process.env.PONG_REUSABLE_ADMISSION_EXISTING??'').split(',').filter(Boolean).map(BigInt);
assert(existing.length===0||existing.length===2,'Explicit existing epochs required for both test arenas');
const file=`artifacts/reusable-candidate/admission-${label}.json`;
await mkdir('artifacts/reusable-candidate',{recursive:true});
let report:any={startedAt:new Date().toISOString(),lobby:m.lobby,arenas:[],assignments:[],passed:false,
 scope:'Two empty hosted arenas and at most eight private test assignments over 45 minutes; no production budget or continuity qualification.'};
try{report=JSON.parse(await readFile(file,'utf8'));assert.equal(report.lobby,m.lobby);assert(!report.finishedAt,'Preserve completed fixture');}
catch(e){if((e as any).code!=='ENOENT')throw e;}
const save=async()=>{await writeFile(file+'.next',JSON.stringify(report,null,2));await rename(file+'.next',file);};
const t=await chainTools(m.prefix+':admission-test-'+label,measuredFetch('monad'));
const finishMetrics=await agentMetrics('/diagnostics/reusable','human-admission-qualification');
const read=(at:Address,abi:any,fn:string,args:any[]=[])=>t.base.readContract({address:at,abi,functionName:fn,args}) as Promise<any>;
const write=(...args:Parameters<typeof t.write>)=>retryOperatorContention(()=>t.write(...args));
const deadline=Date.parse(report.startedAt)+45*60_000;
try{
 assert(deadline>Date.now(),'Original fixture deadline expired');
 for(const a of m.arenas.slice(0,2)){
  assert.equal((await read(a.app,arenaAbi,'lobby')).toLowerCase(),m.lobby.toLowerCase());
  let d=await readHubDelegation(t.base,m.hub,a.app),row=report.arenas.find((x:any)=>x.app===a.app);
  if(!row){
   assert.equal(await read(m.lobby,lobbyAbi,'reservedMatch',[a.app]),0n);
   const [prior,count]=await read(a.app,arenaAbi,'resultCommitment');
   if(existing.length){
    assert.equal(d.status,1);assert.equal(d.epoch,existing[m.arenas.indexOf(a)]);assert.equal(prior,d.epoch);assert.equal(count,0);
    const [slotEpoch,id]=await read(a.app,arenaAbi,'currentMatch');assert.equal(slotEpoch,0n);assert.equal(id,0n);
    row={app:a.app,epoch:String(d.epoch),existing:true};
   }else{assert.equal(d.status,0,'Only released arenas may enter this experiment');row={app:a.app,epoch:String(prior+1n)};}
   report.arenas.push(row);await save();
  }
  if(!row.hash&&!row.existing){
   const validator=await read(m.hub,hubAbi,'defaultValidator'),terms=await read(m.hub,hubAbi,'termsOf',[validator]);
   assert.equal(terms.delegationFee,0n,'Changed provider fee needs review');
   const receipt=await write('open-'+a.app+'-'+row.epoch,m.lobby,lobbyAbi,'openReusableArena',[a.app],0n);
   row.hash=receipt.transactionHash;await save();
  }
  d=await readHubDelegation(t.base,m.hub,a.app);assert.equal(d.status,1);assert.equal(String(d.epoch),row.epoch);
  row.baseBlock=String(d.baseBlock);row.expiresAt=String(d.expiresAt);await save();
 }
 while(Date.now()<deadline&&report.assignments.length<8){
  const response=await fetch('http://independent-events-service:4012/independent/config',{signal:AbortSignal.timeout(8000)});
  assert(response.ok,'Private service unavailable');const config=await response.json() as any;
  assert.equal(config.manifest.lobby.toLowerCase(),m.lobby.toLowerCase());
  report.observedAt=new Date().toISOString();
  report.health=config.arenas.map((a:any)=>({app:a.app,stage:a.stage,epoch:a.epoch}));await save();
  if(config.arenas.filter((a:any)=>a.stage==='available'&&report.arenas.some((r:any)=>r.app.toLowerCase()===a.app.toLowerCase())).length){
   const pending=[];
   for(const slot of [0n,1n]){const id=await read(m.lobby,lobbyAbi,'slot',[slot]);if(!id)continue;
    const p=await read(m.lobby,lobbyAbi,'proposal',[id]);if(p.status===2&&await read(m.lobby,lobbyAbi,'arenaOf',[id])===zeroAddress)pending.push(id as bigint);}
   pending.sort((a,b)=>a<b?-1:1);
   if(pending.length){
    const simulation=await t.base.simulateContract({address:m.lobby,abi:lobbyAbi,functionName:'assignNext'});
    if(simulation.result!==zeroAddress){
     assert(report.arenas.some((a:any)=>a.app.toLowerCase()===simulation.result.toLowerCase()));
     const id=pending[0],receipt=await write('assign-'+id,m.lobby,lobbyAbi,'assignNext');
     const app=await read(m.lobby,lobbyAbi,'arenaOf',[id]);assert.notEqual(app,zeroAddress);
     report.assignments.push({id:String(id),app,hash:receipt.transactionHash});await save();
    }
   }
  }
  await new Promise(resolve=>setTimeout(resolve,2500));
 }
 report.passed=report.assignments.length>0;
}catch(e){report.error=String((e as any).shortMessage??(e as Error).message).split('\n')[0].replace(/0x[\da-f]{90,}/gi,'[omitted]').slice(0,300);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await save();await finishMetrics();await t.close();console.log(JSON.stringify({file,assignments:report.assignments.length,error:report.error}));}
