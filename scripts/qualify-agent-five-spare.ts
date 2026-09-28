// Open one already deployed, empty private arena after the preceding rotation.
// No admissions, role changes, public migration or publication-budget changes.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createPublicClient,http,keccak256,parseEther} from 'viem';
import {chainTools} from './independent-chain-tools';
import {retryOperatorContention} from '../shared/operator-contention';
import {readHubDelegation} from '../shared/rooms-hub';
import {reusableAgentPoolAbi as poolAbi} from '../shared/abi-ReusableAgentPool';
import {reusableAgentArenaAbi as arenaAbi} from '../shared/abi-ReusableAgentArena';
import {abi as hubAbi} from '../shared/abi-independent-IInterludeHub';
import {verifyHostedArenaEvidence} from '../shared/hosted-arena-identity';
import {measuredFetch} from '../shared/rpc-metrics';
import {agentMetrics} from '../relayer/src/agents/metrics';
assert.equal(process.env.PONG_FIVE_SPARE,'bounded-private-seven');
assert.equal(process.getuid?.(),1000);
const deadline=Date.parse(process.env.PONG_FIVE_SPARE_DEADLINE??'');
assert(deadline>Date.now()&&deadline<Date.now()+12*60_000);
const r=JSON.parse(await readFile('/secrets/deployment.json','utf8'));
assert(r.maxMatches===5&&!r.continuation);
const prior=JSON.parse(await readFile('artifacts/reusable-candidate/five-rotation-1.json','utf8'));
assert(prior.passed&&prior.renewedVerified&&prior.source===r.arenas[0].app);
const backup=JSON.parse(await readFile('/backup/off-vps.json','utf8'));assert(backup.verified&&backup.files===3);
const arena=r.arenas[6];assert(arena);
const file='artifacts/reusable-candidate/five-spare-1.json';
const report:any={startedAt:new Date().toISOString(),deadline,app:arena.app,backup,passed:false};
await writeFile(file,JSON.stringify(report),{flag:'wx'});
const t=await chainTools(r.prefix+':five-spare-1',measuredFetch('monad'));
const metrics=await agentMetrics('/diagnostics/reusable','spare-qualification');
try{
 assert.equal(await t.base.readContract({address:r.common.pool,abi:poolAbi,functionName:'publicAdmissions'}),false);
 assert.equal(keccak256((await t.base.getCode({address:arena.app}))!),arena.runtimeHash);
 const d=await readHubDelegation(t.base,r.common.hub,arena.app);assert(d.status===0&&d.epoch===0n,'Only this unused private arena');
 const validator=await t.base.readContract({address:r.common.hub,abi:hubAbi,functionName:'defaultValidator'});
 const terms=await t.base.readContract({address:r.common.hub,abi:hubAbi,functionName:'termsOf',args:[validator]});assert.equal(terms.delegationFee,0n);
 report.publisherBalance=await t.base.getBalance({address:validator});assert(report.publisherBalance>parseEther('15000'),'Preserve the shared publisher reserve');
 const tx=await retryOperatorContention(()=>t.write('open-arena6',r.common.pool,poolAbi,'openReusableArena',[arena.app]));
 report.open={hash:tx.transactionHash,block:tx.blockNumber};
 await writeFile(file,JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2));
 const url=`https://il-${arena.app.slice(2,18).toLowerCase()}.fly.dev`;
 const node=createPublicClient({transport:http(url,{retryCount:0,timeout:5000,fetchFn:measuredFetch('interlude')})});
 while(Date.now()<deadline){
  try{
   const current=await readHubDelegation(t.base,r.common.hub,arena.app);assert(current.status===1&&current.epoch===1n);
   const [session,rulesVersion,response]=await Promise.all([
    node.request({method:'interlude_session',params:[]} as any),
    node.readContract({address:arena.app,abi:arenaAbi,functionName:'RULES_VERSION'}),
    measuredFetch('interlude','health')(url+'/health',{signal:AbortSignal.timeout(5000)}),
   ]);
   assert(response.ok);
   report.verified=verifyHostedArenaEvidence({app:arena.app,epoch:1n,chainId:4242,baseBlock:current.baseBlock,rulesVersion:15n,runtimeHash:arena.runtimeHash},
    {session,rulesVersion,runtimeHash:arena.runtimeHash,health:await response.json()});
   report.passed=true;break;
  }catch{await new Promise(resolve=>setTimeout(resolve,2500));}
 }
 assert(report.passed,'Original spare-readiness deadline');
}catch(e){report.error=String((e as any)?.shortMessage??(e as Error).message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,240);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await writeFile(file,JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2));await t.close();await metrics();console.log(JSON.stringify({passed:report.passed,error:report.error}));}
