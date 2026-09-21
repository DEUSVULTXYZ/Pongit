// Return the idle human test capacity before opening the migrated deployment.
// Results and financial contracts remain readable; the existing service releases
// and seals these epochs at their real hub deadlines. No renewal is requested.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createPublicClient,http} from 'viem';
import {chainTools} from './independent-chain-tools';
import {readHubDelegation} from '../shared/rooms-hub';
import {abi as arenaAbi} from '../shared/abi-independent-ReusableEventsArena';
import {abi as lobbyAbi} from '../shared/abi-independent-ReusableEventsLobby';
import {abi as ratingsAbi} from '../shared/abi-independent-PublishedRatings';
assert.equal(process.env.PONG_RETIRE_HUMAN_FIXTURE,'reusable-human3-before-migration');
const m=JSON.parse(await readFile(process.env.PONG_INDEPENDENT_MANIFEST!,'utf8'));
assert.equal(m.production,false);assert.equal(m.prefix,'independent-qualification-reusable-20260920-3');
assert.equal(m.lobby,'0x4ac828012cd2be48ab669a55db5a85cac81b4bcf');
const t=await chainTools(m.prefix+':retire-for-migration');
const report:any={at:new Date().toISOString(),lobby:m.lobby,arenas:[],passed:false};
try{
 for(const a of m.arenas.slice(0,2)){
  const d=await readHubDelegation(t.base,m.hub,a.app);
  assert.equal(await t.base.readContract({address:m.lobby,abi:lobbyAbi,functionName:'reservedMatch',args:[a.app]}),0n);
  assert.equal(d.status,1,'Preserve existing closure and recovery');
  const node=createPublicClient({transport:http(a.node??`https://il-${a.app.slice(2,18)}.fly.dev`,{retryCount:0,timeout:10000})});
  const session:any=await node.request({method:'interlude_session',params:[]} as any);
  assert.equal(session.app.toLowerCase(),a.app);assert.equal(BigInt(session.epoch),d.epoch);
  assert(Array.isArray(session.pendingDiffs)&&session.pendingDiffs.length===0,'Unpublished engine writes remain');
  const published=await t.base.readContract({address:a.app,abi:arenaAbi,functionName:'resultCommitment'});
  assert.deepEqual(await node.readContract({address:a.app,abi:arenaAbi,functionName:'resultCommitment'}),published);
  const result=await t.base.readContract({address:a.app,abi:arenaAbi,functionName:'publishedResult'});
  assert.deepEqual(await node.readContract({address:a.app,abi:arenaAbi,functionName:'publishedResult'}),result);
  assert(result.match_.status>=3);assert.equal(result.match_.epoch,d.epoch);
  assert(await t.base.readContract({address:m.ratings,abi:ratingsAbi,functionName:'indexOf',args:[result.match_.id]})>0n);
  const receipt=await t.write(`close-${a.app}-${d.epoch}`,m.lobby,lobbyAbi,'closeReusableArena',[a.app]);
  const closed=await readHubDelegation(t.base,m.hub,a.app);assert.equal(closed.status,2);
  report.arenas.push({app:a.app,epoch:String(d.epoch),count:published[1],root:published[2],batches:String(d.batchIndex),hash:receipt.transactionHash,releaseAt:String(closed.stakeUnlockAt)});
 }
 report.passed=true;
}catch(e){report.error=String((e as any).shortMessage??(e as Error).message).split('\n')[0].replace(/0x[\da-f]{90,}/gi,'[omitted]').slice(0,300);process.exitCode=1;}
finally{await mkdir('artifacts/reusable-candidate',{recursive:true});await writeFile(`artifacts/reusable-candidate/retire-human3-${Date.now()}.json`,JSON.stringify(report,null,2));await t.close();console.log(JSON.stringify(report));}
