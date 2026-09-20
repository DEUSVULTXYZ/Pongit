// Reconcile an already terminal qualification match after delayed publication.
// No engine command, admission, delegation closure or replacement nonce is sent.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {decodeAbiParameters,getAbiItem,keccak256,type Address} from 'viem';
import {chainTools} from './independent-chain-tools';
import {retryOperatorContention} from '../shared/operator-contention';
import {PublishedResultIndex,publishedResultLeaf} from '../shared/published-result-tree';
import {reusableAdmissionDigest} from '../shared/reusable-admission';
import {reusableAgentArenaAbi as arenaAbi} from '../shared/abi-ReusableAgentArena';
import {reusableAgentPoolAbi as poolAbi} from '../shared/abi-ReusableAgentPool';
import {measuredFetch} from '../shared/rpc-metrics';
import {agentMetrics} from '../relayer/src/agents/metrics';

assert.equal(process.env.PONG_REUSABLE_AGENT_QUALIFICATION,'isolated-vps');
assert.equal(process.getuid?.(),1000);
const run=process.env.PONG_AGENT_QUALIFICATION_RUN;assert(run&&/^[a-z0-9-]{1,30}$/.test(run));
const id=BigInt(process.env.PONG_RECOVER_MATCH_ID??'0');assert(id>0n);
const file=`/secrets/qualification-${run}.json`,state=JSON.parse(await readFile(file,'utf8'));
const manifest=JSON.parse(await readFile('/secrets/deployment.json','utf8'));
assert.equal(manifest.rulesVersion,15);assert.equal(state.pool,manifest.common.pool);
assert(manifest.arenas.some((a:{app:string})=>a.app===state.app));
const protectedApps=(process.env.PONG_HUMAN_APPS??'').toLowerCase().split(',').filter(Boolean);
assert(protectedApps.length&&!protectedApps.includes(state.app.toLowerCase()));
assert(!state.jobs.some((j:{state:string})=>j.state==='uncertain'),'Resolve original uncertain commands first');
const metrics=await agentMetrics('/diagnostics/reusable','publication-recovery');
const tools=await chainTools(manifest.prefix+':reuse-live-'+run,measuredFetch('monad'));
const report:any={at:new Date().toISOString(),scope:'Delayed canonical publication recovery only; original qualification remains failed',id:String(id),app:state.app,passed:false};
try{
 const ref={chainId:10143n,arena:state.app as Address,epoch:BigInt(state.epoch),id};
 const read=async(address:Address,abi:any,functionName:string,args:any[]=[])=>tools.base.readContract({address,abi,functionName,args} as any) as Promise<any>;
 assert.equal(await read(state.pool,poolAbi,'publicAdmissions'),false);
 const [epoch,count,root]=await read(state.app,arenaAbi,'resultCommitment');assert.equal(epoch,ref.epoch);
 const index=new PublishedResultIndex();for(const r of state.results)index.append(r.index,r.leaf,r.root);
 assert.equal(index.count,count);assert.equal(index.root,root,'Exact canonical prefix is required');
 const archived=state.results.find((r:any)=>r.id===String(id));assert(archived);
 const result=decodeAbiParameters(getAbiItem({abi:arenaAbi,name:'publishedResult'}).outputs,archived.canonical)[0];
 assert.equal(result.match_.ref.arena.toLowerCase(),ref.arena.toLowerCase());
 assert.equal(result.match_.ref.chainId,ref.chainId);assert.equal(result.match_.ref.epoch,ref.epoch);
 assert.equal(result.match_.ref.id,id);assert.equal(result.match_.status,3);
 const [ticket]=await read(state.pool,poolAbi,'ticketOf',[ref]);
 assert.equal(archived.leaf,publishedResultLeaf({chainId:10143n,arena:ref.arena,epoch},id,reusableAdmissionDigest(ticket),keccak256(archived.canonical)));
 const receipt=await retryOperatorContention(()=>tools.write(`capture-${id}`,state.pool,poolAbi,'captureProof',[ref,result,index.proof(archived.index,{count,root})]));
 assert((await read(state.pool,poolAbi,'record',[ref])).captured);
 for(const player of [result.match_.a,result.match_.b])assert.equal(await read(state.pool,poolAbi,'playing',[player]),'0x'+'00'.repeat(32));
 report.passed=true;report.transactionHash=receipt.transactionHash;report.publishedCount=String(count);report.publishedRoot=root;
 report.score=[result.match_.scoreA,result.match_.scoreB];report.elapsedUs=String(result.match_.elapsedUs);
 const match=state.matches.find((m:any)=>m.ref.id===String(id));assert(match);
 match.captured=true;match.report={...match.report,passed:false,publishedRecovery:report,
  limitation:'Original publication timed out; later canonical recovery does not erase that failed qualification'};
 await writeFile(file+'.next',JSON.stringify(state,null,2),{mode:0o600});await rename(file+'.next',file);
}catch(error){report.error=String((error as any)?.shortMessage??(error as Error).message).split('\n')[0].replace(/0x[\da-f]{90,}/gi,'[omitted]').slice(0,300);process.exitCode=1;}
finally{
 await mkdir('artifacts/reusable-candidate',{recursive:true});
 await writeFile(`artifacts/reusable-candidate/publication-recovery-${id}-${Date.now()}.json`,JSON.stringify(report,null,2));
 await metrics();await tools.close();console.log(JSON.stringify(report));
}
