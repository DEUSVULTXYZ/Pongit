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

assert.equal(process.env.PONG_FIVE_SETUP,'bounded-private-five');
const r=JSON.parse(await readFile('/secrets/deployment.json','utf8'));
validateReusableRecord(r,(process.env.PONG_HUMAN_APPS??'').split(',').filter(Boolean));
assert(r.maxMatches===5&&r.houseInstances==='official-v1'&&!r.continuation,'Fresh private fixture only');
const deadline=Date.parse(process.env.PONG_FIVE_SETUP_DEADLINE??'');
assert(Number.isFinite(deadline)&&deadline>Date.now()&&deadline<Date.now()+30*60_000,'Bounded setup deadline required');
const t=await chainTools(r.prefix+':five-setup');
const report:any={startedAt:new Date().toISOString(),pool:r.common.pool,opened:[],qualified:false,publiclyEnabled:false};
await mkdir('artifacts/reusable-candidate',{recursive:true});
try{
 const at=await t.base.getBlock();
 for(const name of ['admissions','publicAdmissions'] as const)
  assert.equal(await t.base.readContract({address:r.common.pool,abi,functionName:name,blockNumber:at.number}),false,'Private gates must remain closed');
 for(let lane=0;lane<5;lane++)assert.equal((await t.base.readContract({address:r.common.pool,abi,functionName:'laneRecord',args:[lane],blockNumber:at.number})).ref.id,0n);
 const validator=await t.base.readContract({address:r.common.hub,abi:hubAbi,functionName:'defaultValidator',blockNumber:at.number});
 const terms=await t.base.readContract({address:r.common.hub,abi:hubAbi,functionName:'termsOf',args:[validator],blockNumber:at.number});
 assert.equal(terms.delegationFee,0n,'Review changed provider fees before qualification');
 for(const role of ['admission','maintenance','archive','sponsor']){
  assert(Date.now()<deadline,'Original setup deadline reached');
  const address=r.serviceOperators[role];assert(address&&address.toLowerCase()!==t.account.address.toLowerCase());
  await retryOperatorContention(()=>t.submit('fund-'+role,'0x',address,parseEther('5')));
 }
 for(const a of r.arenas.slice(0,5)){
  assert(Date.now()<deadline,'Original setup deadline reached');
  assert.equal(keccak256((await t.base.getCode({address:a.app}))!),a.runtimeHash,'Canonical candidate code mismatch');
  const prior=await readHubDelegation(t.base,r.common.hub,a.app);
  const id='open-'+a.app.toLowerCase();
  const job=(await t.db.query('SELECT status FROM il_lifecycle_jobs WHERE id=$1',[r.prefix+':five-setup:'+id])).rows[0];
  assert(prior.status===0||job&&prior.epoch===1n,'Opening belongs to another operation');
  const receipt=await retryOperatorContention(()=>t.write(id,r.common.pool,abi,'openReusableArena',[a.app],terms.delegationFee));
  const d=await readHubDelegation(t.base,r.common.hub,a.app);
  assert(d.status===1&&d.epoch===1n,'Canonical first delegation required');
  report.opened.push({app:a.app,hash:receipt.transactionHash,epoch:String(d.epoch),baseBlock:String(d.baseBlock),expiresAt:String(d.expiresAt)});
  await writeFile('artifacts/reusable-candidate/five-setup.json',JSON.stringify(report,null,2));
 }
 report.passed=true;
}catch(e){report.passed=false;report.error=String((e as any)?.shortMessage??(e as Error).message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,240);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await writeFile('artifacts/reusable-candidate/five-setup.json',JSON.stringify(report,null,2));await t.close();console.log(JSON.stringify({passed:report.passed,opened:report.opened.length,qualified:false,error:report.error}));}
