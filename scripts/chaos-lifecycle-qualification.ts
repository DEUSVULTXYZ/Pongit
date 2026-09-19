// Exercise the real lifecycle on the disposable rules-8 app only. Operator jobs
// keep their shared nonce owner; all gameplay/result queries use the fixture DB.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {parseTransaction,decodeFunctionData,parseAbi,zeroHash,type PublicClient} from 'viem';
import {createInterludeClient,memoryStore} from '@interludelayer-sdk/sdk';
import {chainTools} from './independent-chain-tools';
import {chaosQualificationRecord,verifyQualificationApp} from './chaos-qualification-record';
import {roomsLifecycle} from '../relayer/src/rooms-lifecycle';
import {publishedResultReader} from '../relayer/src/rooms-finalization';
import {readHubDelegation} from '../shared/rooms-hub';
import {roomsEventsAbi as abi} from '../shared/abi-PongChaosEvents';
import {assertRoomsEngineAvailable} from '../shared/rooms-availability';

assert.equal(process.env.PONG_CHAOS_LIFECYCLE,'qualified-private-cycle');
const {prefix,record:r}=await chaosQualificationRecord();
const m=JSON.parse(await readFile('artifacts/drand/integration-manifests.json','utf8'));
assert.equal(m.game.app,r.app);
assert.equal(m.finance.app,r.app);assert.equal(m.game.rulesVersion,8);assert.equal(m.finance.rulesVersion,8);
assert.notEqual((await(await fetch('https://pongit.xyz/api/interlude/config')).json()).app?.toLowerCase(),r.app.toLowerCase());
for(const path of ['chaos-hosted.json','real-browser-1/report.json','real-browser-2/report.json','real-browser-3/report.json']){
 const proof=JSON.parse(await readFile('artifacts/drand/'+path,'utf8'));assert(proof.passed&&proof.app===r.app,`Missing gate ${path}`);
}
const t=await chainTools(prefix+'-lifecycle');
const fixture=new Pool({connectionString:process.env.PONG_CHAOS_DATABASE_URL});
assert.equal((await fixture.query('SELECT current_database() AS name')).rows[0].name,'pong_rules8_qualification');
let report:any={at:new Date().toISOString(),app:r.app,source:'roomsLifecycle',states:[],renewalReady:false};
try{const prior=JSON.parse(await readFile('artifacts/drand/lifecycle-qualification.json','utf8'));assert.equal(prior.app,r.app);report={...prior,resumedAt:new Date().toISOString()};delete report.error;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
report.renewalReady=false;delete report.finishedAt;
const persist=()=>writeFile('artifacts/drand/lifecycle-qualification.json',JSON.stringify(report,null,2));
let lifecycle:Awaited<ReturnType<typeof roomsLifecycle>>=null;
try{
 await verifyQualificationApp(t,prefix,r.app);
 const bindingAbi=parseAbi(['function game() view returns(address)','function hub() view returns(address)']);
 assert.equal((await t.base.readContract({address:r.app,abi:bindingAbi,functionName:'hub'})).toLowerCase(),m.game.hub.toLowerCase());
 assert.equal((await t.base.readContract({address:m.finance.adapter,abi:bindingAbi,functionName:'game'})).toLowerCase(),r.app.toLowerCase());
 const client=createInterludeClient({app:r.app,abi,node:r.node,base:t.base,store:memoryStore(),fastPath:true});
 const initial=await readHubDelegation(t.base,m.game.hub,r.app);assert([1n,2n].includes(initial.epoch));
 if(initial.status===1)assert.equal(await client.read('activeCount'),0n,'Stop fixture admission before lifecycle qualification');
 assert.equal(await t.base.readContract({address:r.app,abi,functionName:'activeCount'}),0n);
 // Keep the global pending/nonce checks. Never hide a foreign job and continue
 // with a higher nonce, or let this private rehearsal re-send it.
 const db={connect:()=>t.db.connect(),query:async(sql:string,args?:any[])=>{
  const result=await (/\bil_(results|engine_jobs|engine_refusals)\b/.test(sql)?fixture:t.db).query(sql,args);
  if(/SELECT[\s\S]*il_lifecycle_jobs/.test(sql)&&sql.includes("status='pending'"))
   for(const job of result.rows)assert(job.app===r.app&&job.id.startsWith(r.app+':'),'Another operator job needs its own authorized reconciliation');
  return result;
 }} as unknown as Pool;
 const releaseAbi=parseAbi(['function releaseStake(address,bytes32)']);
 const finalAbi=parseAbi(['function finalizeResult(uint256)']);
 const guardedBase=new Proxy(t.base,{get(target,property){
  if(property!=='sendRawTransaction')return Reflect.get(target,property);
  return async(parameters:any)=>{
   const tx=parseTransaction(parameters.serializedTransaction);assert.equal(tx.chainId,10143);assert.equal(tx.value??0n,0n);
   const to=tx.to?.toLowerCase();assert(tx.data);
   if(to===r.app.toLowerCase())assert(['closeEngine','renewEngine'].includes(decodeFunctionData({abi,data:tx.data}).functionName));
   else if(to===m.game.hub.toLowerCase()){const call=decodeFunctionData({abi:releaseAbi,data:tx.data});assert.equal(call.args[0].toLowerCase(),r.app.toLowerCase());assert.equal(call.args[1],zeroHash);}
   else if(to===m.finance.adapter.toLowerCase())decodeFunctionData({abi:finalAbi,data:tx.data});
   else throw Error('Private lifecycle cannot send to this target');
   return target.sendRawTransaction(parameters);
  };
 }}) as PublicClient;
 process.env.ROOMS_LIFECYCLE_MAX_BATCHES='600';process.env.ROOMS_LIFECYCLE_HOLD_WRITES='false';process.env.ROOMS_LIFECYCLE_HOLD_RENEW='false';
 if(initial.epoch===1n&&initial.status===1){assert(initial.batchIndex>=600n,'Need real accumulated batches to exercise pressure');report.pressure??={at:new Date().toISOString(),epoch:'1',batches:String(initial.batchIndex),challengeWindow:String(initial.challengeWindow)};await persist();}
 else assert(report.pressure&&BigInt(report.pressure.batches)>=600n,'Missing persisted pre-closure pressure evidence');
 lifecycle=await roomsLifecycle({db,base:guardedBase,app:r.app,hub:m.game.hub,adapter:m.finance.adapter,nodeUrl:r.node,
  engineStatus:()=>client.status(),engineActive:async()=>await client.read('activeCount') as bigint,
  publishedResult:publishedResultReader(t.base,m.finance),
  beforeClose:async()=>{assert.equal(await client.read('activeCount'),0n);const d=await readHubDelegation(t.base,m.game.hub,r.app);assert.equal(d.epoch,1n);assert(d.batchIndex>=600n);report.closingBatches=String(d.batchIndex);await persist();},
 });assert(lifecycle);
 const deadline=Date.now()+95*60_000;let previous='';
 while(Date.now()<deadline){
  await lifecycle.cycle();const status=lifecycle.status(),key=JSON.stringify(status);
  if(previous!==key){report.states.push({at:new Date().toISOString(),...status});previous=key;await persist();}
  if(status.epoch==='2'&&status.stage==='playing'&&status.healthy){
   const d=await readHubDelegation(t.base,m.game.hub,r.app);assert.equal(d.status,1);assert.equal(d.epoch,2n);
   const node=await client.status();assertRoomsEngineAvailable(r.app,node,d,Math.floor(Date.now()/1000));assert.equal(BigInt(node.epoch),2n);assert.equal(BigInt(node.committedBatches),d.batchIndex);assert.equal(await client.read('activeCount'),0n);
   report.renewalReady=true;report.finishedAt=new Date().toISOString();break;
  }
  if(status.error.includes('operator inspection required'))throw Error(status.error);
  await new Promise(resolve=>setTimeout(resolve,10000));
 }
 assert(report.renewalReady,'Lifecycle did not finish within the qualification window');
 const jobs=(await t.db.query('SELECT id,hash,status FROM il_lifecycle_jobs WHERE app=$1 AND id LIKE $2 ORDER BY nonce',[r.app,r.app+':%'])).rows;
 report.transactions=[];
 for(const action of ['close','release','renew'])assert(jobs.some(j=>j.id===r.app+':1:'+action),'Missing exact lifecycle operation '+action);
 const times:Record<string,bigint>={};
 for(const job of jobs){assert.equal(job.status,'confirmed');const receipt=await t.base.getTransactionReceipt({hash:job.hash});assert.equal(receipt.status,'success');times[job.id]=(await t.base.getBlock({blockNumber:receipt.blockNumber})).timestamp;report.transactions.push({id:job.id,hash:job.hash,gasUsed:String(receipt.gasUsed),block:String(receipt.blockNumber)});}
 report.challengeWaitSeconds=String(times[r.app+':1:release']-times[r.app+':1:close']);assert(BigInt(report.challengeWaitSeconds)>=BigInt(report.pressure.challengeWindow));
 report.nextGate='Play and publish a new match in epoch 2; renewal alone is not full qualification';
}catch(e){report.renewalReady=false;report.error=String((e as Error).message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[hex omitted]');process.exitCode=1;}
finally{lifecycle?.stop();await persist();await fixture.end();await t.close();console.log(JSON.stringify({app:r.app,renewalReady:report.renewalReady,error:report.error}));}
