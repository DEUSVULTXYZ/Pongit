import {readFile} from 'node:fs/promises';
import {createPublicClient,http,encodeFunctionData} from 'viem';
import {publicIndependentManifest} from '../shared/independent';
import {readHubDelegation} from '../shared/rooms-hub';
import {independentReader} from '../shared/independent-read';
import {readEngineSnapshot} from '../shared/engine-snapshot';
import {engineState} from '../shared/engine-stream';
import {abi} from '../shared/abi-independent-IndependentArena';
const m=publicIndependentManifest(JSON.parse(await readFile(process.env.PONG_INDEPENDENT_MANIFEST!,'utf8')));
const base=createPublicClient({transport:http(process.env.RPC_URL,{retryCount:0,timeout:8000})}),r=independentReader(base,m);
for(const a of m.arenas){
 const b=await r.arena(a.app,'boundMatch'),d=await readHubDelegation(base,m.hub,a.app);
 const report:any={app:a.app,binding:{id:b.id,epoch:b.epoch,mode:b.mode},delegation:{epoch:d.epoch,status:d.status,lastCommit:d.lastCommitAt,maxBatchInterval:d.maxBatchInterval,expires:d.expiresAt,release:d.stakeUnlockAt}};
 if(b.epoch&&d.status===1){try{
  const node=createPublicClient({transport:http(a.node,{retryCount:0,timeout:8000})});
  const status:any=await node.request({method:'interlude_session',params:[]} as any);report.node={epoch:status.epoch,committedBatches:status.committedBatches,pendingDiffs:status.pendingDiffs?.length};
  const snapshot=engineState(await readEngineSnapshot({node,app:a.app,abi},b.id));report.snapshot={id:snapshot.id,phase:snapshot.phase,revision:snapshot.revision,clock:snapshot.clock,score:[snapshot.state.scoreA,snapshot.state.scoreB],paused:snapshot.state.awaitingServe,halves:[snapshot.state.halfA,snapshot.state.halfB]};
 }catch(e){report.error=String((e as any).shortMessage||(e as Error).message).slice(0,400);}}
 console.log(JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v));
}
