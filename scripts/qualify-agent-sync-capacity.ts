// Opens only the four remaining owned arenas of the bounded rules-16 fixture.
// Does not admit games, fund roles, change budgets or touch public gates.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {keccak256,parseEther} from 'viem';
import {chainTools} from './independent-chain-tools';
import {retryOperatorContention} from '../shared/operator-contention';
import {readHubDelegation} from '../shared/rooms-hub';
import {reusableAgentPoolAbi as poolAbi} from '../shared/abi-ReusableAgentPool';
import {abi as hubAbi} from '../shared/abi-independent-IInterludeHub';
import {NO_LEASE_HUB} from '../shared/hub-lease';
import {validateReusableRecord} from '../relayer/src/agents/reusable-runtime';

assert.equal(process.env.PONG_SYNC_CAPACITY,'bounded-private-five');
assert.equal(process.getuid?.(),1000);
const deadline=Date.parse(process.env.PONG_SYNC_CAPACITY_DEADLINE??'');
assert(deadline>Date.now()&&deadline<Date.now()+10*60_000);
const r=JSON.parse(await readFile('/secrets/deployment.json','utf8'));
validateReusableRecord(r,(process.env.PONG_HUMAN_APPS??'').split(',').filter(Boolean));
assert.equal(r.prefix,'reusable-agents-20261002-1');
assert.equal(r.common.pool.toLowerCase(),'0xd47bc7fece722a237c6547f85b4dd91c2601a4c8');
assert.equal(r.common.hub.toLowerCase(),NO_LEASE_HUB.toLowerCase());
assert(r.maxMatches===5&&r.arenas.length===5&&!r.continuation&&r.rulesVersion===16);
for(const mode of [0,1]){
 const previous=JSON.parse(await readFile(`artifacts/reusable-candidate/synchronization-${mode}.json`,'utf8'));
 assert(previous.passed&&previous.pool===r.common.pool&&previous['close-pool']&&previous['close-challenges']);
}
const path='artifacts/reusable-candidate/sync-capacity-open.json';
const report:any={startedAt:new Date().toISOString(),deadline,pool:r.common.pool,opened:[],passed:false,qualified:false};
await writeFile(path,JSON.stringify(report),{flag:'wx'});
const t=await chainTools(r.prefix+':sync-capacity-open');
const save=()=>writeFile(path,JSON.stringify(report,null,2));
try{
 const at=await t.base.getBlock();
 for(const name of ['admissions','publicAdmissions'] as const)
  assert.equal(await t.base.readContract({address:r.common.pool,abi:poolAbi,functionName:name,blockNumber:at.number}),false);
 for(let lane=0;lane<5;lane++)assert.equal((await t.base.readContract({address:r.common.pool,abi:poolAbi,functionName:'laneRecord',args:[lane],blockNumber:at.number})).ref.id,0n);
 const validator=await t.base.readContract({address:r.common.hub,abi:hubAbi,functionName:'defaultValidator',blockNumber:at.number});
 const terms=await t.base.readContract({address:r.common.hub,abi:hubAbi,functionName:'termsOf',args:[validator],blockNumber:at.number});
 assert.equal(validator.toLowerCase(),'0xa375cf27ed39491db8302ffc3df4210ad263ef43');
 assert(terms.open&&terms.maxDelegationDuration===0n&&terms.delegationFee<=parseEther('0.01'));
 report.block=String(at.number);report.openFee=String(terms.delegationFee);
 report.publisherBalance=String(await t.base.getBalance({address:validator,blockNumber:at.number}));
 report.operatorBalance=String(await t.base.getBalance({address:t.account.address,blockNumber:at.number}));
 assert(BigInt(report.publisherBalance)>parseEther('5000')&&BigInt(report.operatorBalance)>parseEther('20'),'Bounded funding reserve not met');
 assert.equal((await t.base.getBlock({blockNumber:at.number})).hash,at.hash);
 for(const arena of r.arenas.slice(1)){
  assert(Date.now()<deadline,'Original setup deadline reached');
  assert.equal(keccak256((await t.base.getCode({address:arena.app}))!),arena.runtimeHash);
  const before=await readHubDelegation(t.base,r.common.hub,arena.app);
  assert(before.status===0&&before.epoch===0n,'Only an unopened private arena is eligible');
  const receipt=await retryOperatorContention(()=>t.write('open-'+arena.app.toLowerCase(),r.common.pool,poolAbi,'openReusableArena',[arena.app],terms.delegationFee));
  const after=await readHubDelegation(t.base,r.common.hub,arena.app);
  assert(after.status===1&&after.epoch===1n);
  report.opened.push({app:arena.app,epoch:String(after.epoch),baseBlock:String(after.baseBlock),hash:receipt.transactionHash});await save();
 }
 report.passed=true;
}catch(e){report.error=String((e as any)?.shortMessage??(e as Error).message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,240);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await save();await t.close();console.log(JSON.stringify({passed:report.passed,opened:report.opened.length,error:report.error}));}
