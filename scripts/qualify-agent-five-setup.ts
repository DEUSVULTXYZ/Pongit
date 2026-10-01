// Bounded setup only: no game admission, tournament start or public exposure.
// Existing lifecycle journal owns every funding/opening transaction.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {keccak256,parseEther} from 'viem';
import {chainTools} from './independent-chain-tools';
import {readHubDelegation} from '../shared/rooms-hub';
import {validateReusableRecord} from '../relayer/src/agents/reusable-runtime';
import {reusableAgentPoolAbi as abi} from '../shared/abi-ReusableAgentPool';
import {abi as hubAbi} from '../shared/abi-independent-IInterludeHub';
import {retryOperatorContention} from '../shared/operator-contention';
import {NO_LEASE_HUB} from '../shared/hub-lease';

assert.equal(process.env.PONG_FIVE_SETUP,'bounded-private-five');
const r=JSON.parse(await readFile('/secrets/deployment.json','utf8'));
validateReusableRecord(r,(process.env.PONG_HUMAN_APPS??'').split(',').filter(Boolean));
assert(r.maxMatches===5&&r.houseInstances==='official-v1'&&!r.continuation,'Fresh private fixture only');
const v3=r.common.hub.toLowerCase()===NO_LEASE_HUB.toLowerCase();
const more=process.env.PONG_FIVE_SETUP_MORE==='after-first-games';
assert(!process.env.PONG_FIVE_SETUP_MORE||more);
if(more){
 assert(v3&&r.common.pool.toLowerCase()==='0x550ff3c22e20fc760af9afd68fba2cb531140dc6','Only the reviewed private v3 pool');
 const prior=JSON.parse(await readFile('artifacts/reusable-candidate/v3-game-close.json','utf8'));
 assert(prior.passed&&prior.before.commitment[1]===2,'The first two games must be captured and normally closing');
}
const count=Number(process.env.PONG_FIVE_SETUP_COUNT??5);
assert(count===5||v3&&count===1,'Only the bounded v3 first-game trial may open one arena');
const deadline=Date.parse(process.env.PONG_FIVE_SETUP_DEADLINE??'');
assert(Number.isFinite(deadline)&&deadline>Date.now()&&deadline<Date.now()+30*60_000,'Bounded setup deadline required');
const t=await chainTools(r.prefix+':five-setup');
const report:any={startedAt:new Date().toISOString(),pool:r.common.pool,opened:[],qualified:false,publiclyEnabled:false};
const reportPath=`artifacts/reusable-candidate/five-setup${more?'-more':''}.json`;
await mkdir('artifacts/reusable-candidate',{recursive:true});
await writeFile(reportPath,JSON.stringify(report),{flag:'wx'});
try{
 const at=await t.base.getBlock();
 for(const name of ['admissions','publicAdmissions'] as const)
  assert.equal(await t.base.readContract({address:r.common.pool,abi,functionName:name,blockNumber:at.number}),false,'Private gates must remain closed');
 for(let lane=0;lane<5;lane++)assert.equal((await t.base.readContract({address:r.common.pool,abi,functionName:'laneRecord',args:[lane],blockNumber:at.number})).ref.id,0n);
 const validator=await t.base.readContract({address:r.common.hub,abi:hubAbi,functionName:'defaultValidator',blockNumber:at.number});
 const terms=await t.base.readContract({address:r.common.hub,abi:hubAbi,functionName:'termsOf',args:[validator],blockNumber:at.number});
 if(v3){assert.equal(validator.toLowerCase(),'0xa375cf27ed39491db8302ffc3df4210ad263ef43');assert(terms.open&&terms.maxDelegationDuration===0n&&terms.delegationFee<=parseEther('0.01'),'Unexpected v3 terms');}
 else assert.equal(terms.delegationFee,0n,'Review changed provider fees before qualification');
 assert.equal((await t.base.getBlock({blockNumber:at.number})).hash,at.hash,'Setup terms changed canonical block');
 for(const role of more?[]:['admission','maintenance','archive','sponsor']){
  assert(Date.now()<deadline,'Original setup deadline reached');
  const address=r.serviceOperators[role];assert(address&&address.toLowerCase()!==t.account.address.toLowerCase());
  await retryOperatorContention(()=>t.submit('fund-'+role,'0x',address,parseEther('5')));
 }
 assert(!more||count===5);
 for(const a of r.arenas.slice(more?1:0,(more?1:0)+count)){
  assert(Date.now()<deadline,'Original setup deadline reached');
  assert.equal(keccak256((await t.base.getCode({address:a.app}))!),a.runtimeHash,'Canonical candidate code mismatch');
  const prior=await readHubDelegation(t.base,r.common.hub,a.app);
  const id='open-'+a.app.toLowerCase();
  const job=(await t.db.query('SELECT status FROM il_lifecycle_jobs WHERE id=$1',[r.prefix+':five-setup:'+id])).rows[0];
  assert(prior.status===0&&prior.epoch===0n||job&&prior.status===1&&prior.epoch===1n,'Opening belongs to another operation');
  const receipt=await retryOperatorContention(()=>t.write(id,r.common.pool,abi,'openReusableArena',[a.app],terms.delegationFee));
  const d=await readHubDelegation(t.base,r.common.hub,a.app);
  assert(d.status===1&&d.epoch===1n,'Canonical first delegation required');
  report.opened.push({app:a.app,hash:receipt.transactionHash,epoch:String(d.epoch),baseBlock:String(d.baseBlock),expiresAt:String(d.expiresAt)});
  await writeFile(reportPath,JSON.stringify(report,null,2));
 }
 report.passed=true;
}catch(e){report.passed=false;report.error=String((e as any)?.shortMessage??(e as Error).message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,240);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await writeFile(reportPath,JSON.stringify(report,null,2));await t.close();console.log(JSON.stringify({passed:report.passed,opened:report.opened.length,qualified:false,error:report.error}));}
