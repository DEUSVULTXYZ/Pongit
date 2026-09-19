// Approved epoch-6 -> epoch-7 recovery only. Never open admission or lift holds.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {parseAbi,zeroHash} from 'viem';
import {createInterludeClient,memoryStore} from '@interludelayer-sdk/sdk';
import {chainTools} from './independent-chain-tools';
import {readHubDelegation} from '../shared/rooms-hub';
import {roomsEventsAbi as abi} from '../shared/abi-PongChaosEvents';
import {publishedResultReader,finalizationVerdict} from '../relayer/src/rooms-finalization';
import {financeScope} from '../relayer/src/rooms-finance-config';
import {requestHostedRenewal} from '../relayer/src/rooms-hosted-renewal';
import {assertRoomsEngineAvailable} from '../shared/rooms-availability';

const check=process.argv.includes('--check');
assert.equal(process.env.PONG_HUMAN_RECOVERY,check?'check-renew-epoch-7':'approved-renew-epoch-7');
const app='0x78d3341e3452d7ec1add9371de3008639eed8eb0',hub='0x3Ef8327F69e09cf721772F345e2A887eA22cD595';
const nodeUrl='https://il-78d3341e3452d7ec.fly.dev';
const frozen='15508105729563744847458450017964175917467653135442864517311236160090280411628';
const config=await(await fetch('https://pongit.xyz/api/interlude/config',{signal:AbortSignal.timeout(12000)})).json();
assert.equal(config.app.toLowerCase(),app);assert.equal(config.admission,false);assert.equal(config.maintenance?.operatorHold,true);
const finance=JSON.parse(await readFile('deployments/rooms-finance.json','utf8')).find((m:any)=>m.app===app&&m.financeId==='events-v1');
assert.equal(finance?.adapter,'0xd7602b6ae87798e0f39ea25b97f75dcc5dd0822f');
const t=await chainTools('human-recovery-20260919');
const report:any={at:new Date().toISOString(),app,action:check?'check-renewal':'renewEngine',results:[],ready:false};
try{
 const binding=parseAbi(['function operator() view returns(address)','function game() view returns(address)','function hub() view returns(address)']);
 assert.equal((await t.base.readContract({address:app,abi:binding,functionName:'operator'})).toLowerCase(),t.account.address.toLowerCase());
 assert.equal((await t.base.readContract({address:app,abi:binding,functionName:'hub'})).toLowerCase(),hub.toLowerCase());
 assert.equal((await t.base.readContract({address:finance.adapter,abi:binding,functionName:'game'})).toLowerCase(),app);
 const d=await readHubDelegation(t.base,hub,app);
 assert(check?d.epoch===6n&&[0,2].includes(d.status):d.epoch===6n&&d.status===0||d.epoch===7n&&d.status===1,'Unexpected delegation; inspect before renewal');
 if(!check){
  const release=(await t.db.query('SELECT hash,status FROM il_lifecycle_jobs WHERE id=$1',['human-recovery-20260919:epoch6-release'])).rows[0];
  assert.equal(release?.status,'confirmed');assert.equal((await t.base.getTransactionReceipt({hash:release.hash})).status,'success');
  // A lost response can leave a successful capture pending in our journal.
  // Reconcile the same bytes even when finalStatus already reports it captured.
  const pending=(await t.db.query("SELECT id,app FROM il_lifecycle_jobs WHERE id LIKE $1 AND status='pending' ORDER BY nonce",['human-recovery-20260919:epoch6-capture-%'])).rows;
  for(const job of pending){
   const id=/^human-recovery-20260919:epoch6-capture-([0-9]+)$/.exec(job.id)?.[1];assert(id);assert.equal(job.app.toLowerCase(),finance.adapter);
   await t.write('epoch6-capture-'+id,finance.adapter,parseAbi(['function finalizeResult(uint256)']),'finalizeResult',[BigInt(id)]);
  }
 }
 if(d.epoch===6n){
  const reader=publishedResultReader(t.base,finance);
  const rows=(await t.db.query('SELECT id FROM il_bettors WHERE app=$1 UNION SELECT id FROM il_results WHERE app=$2 UNION SELECT id FROM il_pressure WHERE app=$1 UNION SELECT id FROM il_live_pressure WHERE app=$1 ORDER BY id',[financeScope(finance),app])).rows;
  for(const row of rows){
   const status=await reader.finalStatus(row.id);
   if(status!==0){report.results.push({id:row.id,verdict:'already-captured',status});continue;}
   const published=await reader.published(row.id),verdict=finalizationVerdict(published);
   report.results.push({id:row.id,verdict,phase:published.phase});
   // Read failures throw. No failed read can become a deferral or a settlement.
   assert(['ready','unmarketed','unpublished'].includes(verdict),'Published result is not yet ready: '+row.id);
   if(verdict==='unpublished')assert.equal(row.id,frozen,'Unexpected unpublished result needs inspection');
  }
  const snapshot=await t.base.readContract({address:app,abi,functionName:'getSnapshot',args:[BigInt(frozen)]});
  assert.equal(snapshot[2],2n);assert.equal(snapshot[12].scoreA,4);assert.equal(snapshot[12].scoreB,6);
  assert.equal(await t.base.readContract({address:app,abi,functionName:'resultHashes',args:[BigInt(frozen)]}),zeroHash);
  assert.equal(await t.base.readContract({address:app,abi,functionName:'activeCount'}),1n);
  report.preserved={id:frozen,phase:2,score:[4,6],revision:String(snapshot[1])};
  if(!check)for(const result of report.results.filter((r:any)=>r.verdict==='ready')){
   if(await reader.finalStatus(result.id)!==0){result.verdict='captured-concurrently';continue;}
   // The immutable adapter reads winner and amounts; the caller supplies only id.
   const capture=await t.write('epoch6-capture-'+result.id,finance.adapter,parseAbi(['function finalizeResult(uint256)']),'finalizeResult',[BigInt(result.id)]);
   assert.notEqual(await reader.finalStatus(result.id),0);
   result.capture={hash:capture.transactionHash,block:String(capture.blockNumber),gasUsed:String(capture.gasUsed)};
  }
 }
 if(check){report.checked=true;}
 else{
  if(d.epoch===7n)assert((await t.db.query('SELECT id FROM il_lifecycle_jobs WHERE id=$1',['human-recovery-20260919:epoch7-renew'])).rowCount,'Epoch was renewed elsewhere; reconcile first');
  const receipt=await t.write('epoch7-renew',app,abi,'renewEngine');
  report.transaction={hash:receipt.transactionHash,block:String(receipt.blockNumber),gasUsed:String(receipt.gasUsed)};
  const renewed=await readHubDelegation(t.base,hub,app);assert.equal(renewed.status,1);assert.equal(renewed.epoch,7n);
  const client=createInterludeClient({app,abi,node:nodeUrl,base:t.base,store:memoryStore(),fastPath:true});
  let valid=0,previous='',observedEpoch:bigint|undefined;const deadline=Date.now()+7*60_000;
  while(Date.now()<deadline&&valid<20){
   let message='';
   try{
    const current=await readHubDelegation(t.base,hub,app),node=await client.status();observedEpoch=BigInt(node.epoch);
    assert.equal(current.epoch,7n);assertRoomsEngineAvailable(app,node,current,Math.floor(Date.now()/1000));
    const health=await(await fetch(nodeUrl+'/health',{signal:AbortSignal.timeout(10000)})).json();
    assert.equal(Number(health.epoch),7);assert(!health.halted,'Node is halted');
    assert.equal(BigInt(node.committedBatches),current.batchIndex,'Waiting for publication synchronization');
    const [live,published,active]=await Promise.all([
     client.read('getSnapshot',[BigInt(frozen)]),
     t.base.readContract({address:app,abi,functionName:'getSnapshot',args:[BigInt(frozen)]}),
     client.read('activeCount'),
    ]);
    assert.equal(live[0],BigInt(frozen));assert([2n,3n,4n].includes(live[2]),'Frozen match was not restored');
    assert.equal(live[3].toLowerCase(),published[3].toLowerCase());assert.equal(live[4].toLowerCase(),published[4].toLowerCase());
    assert(live[1]>=published[1]&&live[12].t>=published[12].t,'Node is behind the published match');
    assert(live[12].scoreA>=4&&live[12].scoreB>=6,'Recovered score regressed');
    assert.equal(active,live[2]===2n?1n:0n,'Active match count is inconsistent');
    if(live[2]>=3n)assert.notEqual(await client.read('resultHashes',[BigInt(frozen)]),zeroHash,'Terminal result is missing');
    report.recovered={id:frozen,phase:Number(live[2]),revision:String(live[1]),score:[live[12].scoreA,live[12].scoreB],active:String(active)};
    valid++;report.last={epoch:'7',batches:String(current.batchIndex),expiresAt:String(current.expiresAt),samples:valid};
   }catch(e){
    valid=0;message=String((e as Error).message).split('\n')[0];
    // The persistent provisioning journal prevents duplicate POSTs after a lost reply.
    if(observedEpoch!==7n){
     const connection=await t.db.connect();let locked=false;
     try{
      locked=(await connection.query('SELECT pg_try_advisory_lock(701340) AS ok')).rows[0].ok;
      if(locked)await requestHostedRenewal(t.db,app,7n,nodeUrl);
      else message='Operator journal busy; hosted provisioning will retry';
     }catch(e){message=String((e as Error).message).split('\n')[0];}
     finally{if(locked)await connection.query('SELECT pg_advisory_unlock(701340)');connection.release();}
    }
    if(message.includes('inspection required')||message.includes('inspect the persisted'))throw Error(message);
   }
   if(message!==previous){console.log(JSON.stringify({event:'human-renewal-observation',message,at:new Date().toISOString()}));previous=message;}
   if(valid<20)await new Promise(resolve=>setTimeout(resolve,valid?1000:10000));
  }
  assert.equal(valid,20,'Renewal transaction confirmed, but hosted node is not qualified yet');
  const after=await(await fetch('https://pongit.xyz/api/interlude/config')).json();assert.equal(after.admission,false);assert.equal(after.maintenance?.operatorHold,true);
  report.ready=true;
 }
}catch(e){report.error=String((e as Error).message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[hex omitted]');process.exitCode=1;}
finally{await mkdir('artifacts/recovery-20260919',{recursive:true});await writeFile(`artifacts/recovery-20260919/human-${check?'renew-check':'renewal'}.json`,JSON.stringify(report,null,2));await t.close();console.log(JSON.stringify(report));}
