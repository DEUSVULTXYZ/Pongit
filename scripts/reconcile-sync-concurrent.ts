import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {privateKeyToAccount} from 'viem/accounts';
import {chainTools} from './independent-chain-tools';
import {retryOperatorContention} from '../shared/operator-contention';
import {loadPoolFamily} from '../shared/agent-pool-family';
import {preparePoolChallenge} from '../shared/agent-pool-client';
import {validateAgentPoolManifest} from '../shared/agent-pool';
import {agentChallengesAbi as challenges} from '../shared/abi-AgentChallenges';
import {reusableAgentPoolAbi as poolAbi} from '../shared/abi-ReusableAgentPool';
import {AgentPoolReader,poolJson} from '../relayer/src/agents/pool-read';
assert.equal(process.env.PONG_SYNC_RECONCILE_COPY,'owned-trial-4');
const r=JSON.parse(await readFile('/metadata/reusable.json','utf8'));
const m=validateAgentPoolManifest(JSON.parse(await readFile('/metadata/manifest.json','utf8')));
assert.equal(m.pool.toLowerCase(),'0x67a61b10126c85dce8a5b4e67b7b637d094ce4ca');
assert.equal(r.prefix,'reusable-agents-20261003-1');assert(!m.enabled&&!m.tournamentsEnabled);
const original=JSON.parse(await readFile('artifacts/reusable-candidate/five-concurrent-4.json','utf8'));
assert(original.finishedAt&&!original.passed&&original['close-challenges']&&!original.pendingReconciliation);
const secretPath='/secrets/five-concurrent-4.json',privateState=JSON.parse(await readFile(secretPath,'utf8'));
const saveSecret=async()=>{await writeFile(secretPath+'.next',poolJson(privateState),{mode:0o600});await rename(secretPath+'.next',secretPath);};
const t=await chainTools(r.prefix+':five-concurrent-4-recovery');
const reader=new AgentPoolReader(t.base,m,[]);
const out='artifacts/reusable-candidate/five-concurrent-4-recovery.json';
const report:any={startedAt:new Date().toISOString(),scope:'Reconcile only this stopped synthetic trial. Preserve natural outage cancellations. Cancel only its still-waiting owner-signed request, never a playing match.',rows:[],passed:false};
try{
 assert.equal(await t.base.readContract({address:m.challenges,abi:challenges,functionName:'admissions'}),false);
 for(const row of original.people){
  const p=privateState.people[row.index],owner=privateKeyToAccount(p.owner);
  assert.equal(owner.address.toLowerCase(),row.player.toLowerCase());
  const result=row.ref?(await reader.match(row.ref)).value.result:null;
  if(row.ref)assert(result&&[3,4].includes(result.status),'Wait for existing engine/archive publication; no recovery driver is allowed to finish the match');
  const pending=await t.base.readContract({address:m.challenges,abi:challenges,functionName:'pending',args:[owner.address]});
  const proof:any={index:row.index,ref:row.ref,result,pending:String(pending)};
  if(pending){
   const request=await t.base.readContract({address:m.challenges,abi:challenges,functionName:'requests',args:[pending]});
   assert.equal(request[0].toLowerCase(),owner.address.toLowerCase());assert.equal(request[3],1,'Never cancel an active challenge');
   const storage={getItem:(k:string)=>p.storage[k]??null,setItem:()=>{throw Error('Read-only family');},removeItem:()=>{throw Error('Read-only family');}};
   const session=loadPoolFamily(m,owner.address,storage);assert(session);
   if(!p.recovery){p.recovery=await preparePoolChallenge(t.base,m,privateKeyToAccount(session.key),owner.address,{agent:request[1],mode:request[2] as 0|1,cancel:pending});await saveSecret();}
   const receipt=await retryOperatorContention(()=>t.submit('cancel-waiting-'+row.index,p.recovery.data,p.recovery.to));
   proof.cancellation=receipt.transactionHash;
   assert.equal(await t.base.readContract({address:m.challenges,abi:challenges,functionName:'pending',args:[owner.address]}),0n);
  }
  report.rows.push(proof);
 }
 for(let i=1;i<5;i++)assert.equal((await t.base.readContract({address:m.pool,abi:poolAbi,functionName:'laneRecord',args:[i]})).ref.id,0n);
 report.passed=true;
}catch(e){report.error=String((e as any)?.shortMessage??(e as Error).message).split('\n')[0].replace(/0x[\da-f]{64,}/gi,'[omitted]').slice(0,180);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await writeFile(out,poolJson(report),{flag:'wx'});await t.close();console.log(poolJson({passed:report.passed,rows:report.rows.length,error:report.error}));}
