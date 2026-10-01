// Reopen only the fully released private epoch after its canonical results were
// sealed. The original operator journal owns funding and opening. No admission.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {keccak256,parseEther} from 'viem';
import {chainTools} from './independent-chain-tools';
import {retryOperatorContention} from '../shared/operator-contention';
import {readHubDelegation} from '../shared/rooms-hub';
import {NO_LEASE_HUB} from '../shared/hub-lease';
import {reusableAgentPoolAbi as poolAbi} from '../shared/abi-ReusableAgentPool';
import {abi as verifierAbi} from '../shared/abi-independent-PublishedResultVerifier';
import {abi as hubAbi} from '../shared/abi-independent-IInterludeHub';
import {agentMetrics} from '../relayer/src/agents/metrics';
import {measuredFetch} from '../shared/rpc-metrics';

assert.equal(process.env.PONG_PRIVATE_V3_RENEWAL,'released-epoch1-only');
assert.equal(process.getuid?.(),1000);
const r=JSON.parse(await readFile('/secrets/deployment.json','utf8'));
assert(!r.continuation&&r.prefix==='reusable-agents-20261001-1');
assert.equal(r.common.pool.toLowerCase(),'0x550ff3c22e20fc760af9afd68fba2cb531140dc6');
assert.equal(r.common.hub.toLowerCase(),NO_LEASE_HUB.toLowerCase());
const arena=r.arenas[0];
assert.equal(arena.app.toLowerCase(),'0x8194191a762a54f2a2bc05fe159e8f418cffe36e');
const root='artifacts/reusable-candidate';
const previous=JSON.parse(await readFile(root+'/v3-game-release.json','utf8'));
const window=JSON.parse(await readFile(root+'/catalogue-window-3.json','utf8'));
const backup=JSON.parse(await readFile(root+'/off-vps.json','utf8'));
assert(previous.passed&&previous.app===arena.app&&previous.epoch==='1');
assert(window.passed&&window.finishedAt&&window['pool-close']&&window['public-close']&&window['queue-close']);
assert(backup.verified&&backup.files===11&&Date.parse(backup.at)>Date.parse(window.finishedAt));
const file=root+'/v3-game-renewal-1.json';
const report:any={startedAt:new Date().toISOString(),app:arena.app,backup,passed:false,
 scope:'Private canonical opening and bounded archive refill only; hosted publication remains a separate gate.'};
await writeFile(file,JSON.stringify(report),{flag:'wx'});
const finishMetrics=await agentMetrics('/diagnostics/reusable','private-renewal');
const t=await chainTools(r.prefix+':v3-game-renewal1',measuredFetch('monad'));
try{
 const block=await t.base.getBlock();
 const read=(address:any,abi:any,functionName:string,args:any[]=[])=>t.base.readContract({address,abi,functionName,args,blockNumber:block.number}) as Promise<any>;
 assert.equal(await read(r.common.pool,poolAbi,'admissions'),false);
 assert.equal(await read(r.common.pool,poolAbi,'publicAdmissions'),false);
 for(let lane=0;lane<5;lane++)assert.equal((await read(r.common.pool,poolAbi,'laneRecord',[lane])).ref.id,0n);
 assert.equal(keccak256((await t.base.getCode({address:arena.app,blockNumber:block.number}))!),arena.runtimeHash);
 const d=await readHubDelegation(t.base,r.common.hub,arena.app,block.number);
 assert(d.status===0&&d.epoch===1n,'Only the already released private first epoch');
 const sealed=await read(r.common.verifier,verifierAbi,'finalizedRoots',[arena.app,1n]);
 assert.deepEqual(sealed,previous.sealed);
 const validator=await read(r.common.hub,hubAbi,'defaultValidator');
 assert.equal(validator.toLowerCase(),'0xa375cf27ed39491db8302ffc3df4210ad263ef43');
 const terms=await read(r.common.hub,hubAbi,'termsOf',[validator]);
 assert(terms.open&&terms.maxDelegationDuration===0n&&terms.delegationFee<=parseEther('0.01'));
 assert.equal((await t.base.getBlock({blockNumber:block.number})).hash,block.hash);
 const archive=r.serviceOperators.archive;
 const balance=await t.base.getBalance({address:archive});
 if(balance<parseEther('2')){
  const tx=await retryOperatorContention(()=>t.submit('archive-10','0x',archive,parseEther('10')));
  report.funding={role:'archive',address:archive,amountWei:String(parseEther('10')),hash:tx.transactionHash};
 }
 const tx=await retryOperatorContention(()=>t.write('open-8194-epoch2',r.common.pool,poolAbi,'openReusableArena',[arena.app],terms.delegationFee));
 const at=await t.base.getBlock(),next=await readHubDelegation(t.base,r.common.hub,arena.app,at.number);
 assert(next.status===1&&next.epoch===2n&&next.expiresAt===0n);
 assert.deepEqual(await t.base.readContract({address:r.common.verifier,abi:verifierAbi,functionName:'finalizedRoots',args:[arena.app,1n],blockNumber:at.number}),sealed);
 assert.equal((await t.base.getBlock({blockNumber:at.number})).hash,at.hash);
 report.transaction={hash:tx.transactionHash,block:tx.blockNumber,gas:tx.gasUsed};
 report.after={block:at.number,hash:at.hash,epoch:next.epoch,status:next.status,baseBlock:next.baseBlock};report.passed=true;
}catch(e){report.error=String((e as any).shortMessage??(e as Error).message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,240);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await writeFile(file,JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2));await t.close();await finishMetrics();console.log(JSON.stringify({passed:report.passed,error:report.error,transaction:report.transaction},(_,v)=>typeof v==='bigint'?String(v):v));}
