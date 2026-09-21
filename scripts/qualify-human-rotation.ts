// Close one fully published idle private arena while another actual game progresses.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createPublicClient,http} from 'viem';
import {chainTools} from './independent-chain-tools';
import {readHubDelegation} from '../shared/rooms-hub';
import {publicIndependentManifest} from '../shared/independent';
import {abi as arenaAbi} from '../shared/abi-independent-ReusableEventsArena';
import {abi as lobbyAbi} from '../shared/abi-independent-ReusableEventsLobby';
assert.equal(process.env.PONG_HUMAN_ROTATION_TEST,'bounded-private-rotation');
const raw=JSON.parse(await readFile(process.env.PONG_INDEPENDENT_MANIFEST!,'utf8'));assert.equal(raw.production,false);assert.equal(raw.rulesVersion,14);
const m=publicIndependentManifest(raw),label=process.env.PONG_ROTATION_RUN!;assert(/^[a-z0-9-]{1,32}$/.test(label));
const out=`artifacts/independent-candidate/rotation-${label}.json`;await mkdir('artifacts/independent-candidate',{recursive:true});
const report:any={startedAt:new Date().toISOString(),lobby:m.lobby,passed:false};await writeFile(out,JSON.stringify(report),{flag:'wx'});
const t=await chainTools(raw.prefix+':rotation-'+label);
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const read=(app:any,abi:any,fn:string,args:any[]=[])=>t.base.readContract({address:app,abi,functionName:fn,args})as Promise<any>;
try{
 const end=Date.now()+15*60_000;let choice:any;
 while(Date.now()<end){
  const response=await fetch('http://independent-events-service:4012/independent/config',{signal:AbortSignal.timeout(8000)});assert(response.ok);const config=await response.json()as any;assert.equal(config.manifest.lobby.toLowerCase(),m.lobby.toLowerCase());
  const playing=config.arenas.filter((a:any)=>a.stage==='playing'&&a.online),idle=config.arenas.filter((a:any)=>a.stage==='available'&&a.online);
  if(playing.length===1&&idle.length===2){
   for(const a of idle){const result=await read(a.app,arenaAbi,'publishedResult');if(result.match_.status>=3){choice={idle:a,playing:playing[0],reserve:idle.find((b:any)=>b.app!==a.app),result};break;}}
  }
  if(choice)break;await sleep(2000);
 }
 assert(choice,'Need a published idle arena, a playing arena and a ready reserve');
 const app=choice.idle.app,node=createPublicClient({transport:http(choice.idle.node,{retryCount:0})}),d=await readHubDelegation(t.base,m.hub,app);
 assert.equal(d.status,1);assert.equal(await read(m.lobby,lobbyAbi,'reservedMatch',[app]),0n);
 const session:any=await node.request({method:'interlude_session',params:[]}as any);assert.equal(BigInt(session.epoch),d.epoch);assert.equal(session.app.toLowerCase(),app.toLowerCase());
 assert(Array.isArray(session.pendingDiffs)&&session.pendingDiffs.length===0);
 assert.deepEqual(await node.readContract({address:app,abi:arenaAbi,functionName:'publishedResult'}),choice.result);
 assert.deepEqual(await node.readContract({address:app,abi:arenaAbi,functionName:'resultCommitment'}),await read(app,arenaAbi,'resultCommitment'));
 const other=choice.playing.app,otherId=await read(m.lobby,lobbyAbi,'reservedMatch',[other]);assert(otherId>0n);
 const otherNode=createPublicClient({transport:http(choice.playing.node,{retryCount:0})});
 const before=await otherNode.readContract({address:other,abi:arenaAbi,functionName:'getSnapshot',args:[otherId]});assert.equal(before.phase,2n);
 report.closeHash=(await t.write('close-'+app+'-'+d.epoch,m.lobby,lobbyAbi,'closeReusableArena',[app])).transactionHash;
 const closed=await readHubDelegation(t.base,m.hub,app);assert.equal(closed.status,2);report.closed={app,epoch:String(d.epoch),releaseAt:String(closed.stakeUnlockAt),batches:String(d.batchIndex)};
 await sleep(2500);const after=await otherNode.readContract({address:other,abi:arenaAbi,functionName:'getSnapshot',args:[otherId]});
 assert.equal(after.id,otherId);assert(after.state.t>before.state.t||after.phase===3n,'Other game did not progress after closure');
 assert.equal((await readHubDelegation(t.base,m.hub,other)).status,1);
 report.parallel={app:other,id:String(otherId),beforeUs:String(before.state.t),afterUs:String(after.state.t),phase:String(after.phase)};
 report.reserve=choice.reserve.app;report.passed=true;
}catch(e){report.error=String((e as any).shortMessage??(e as Error).message).split('\n')[0].replace(/0x[\da-f]{90,}/gi,'[omitted]').slice(0,300);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await writeFile(out,JSON.stringify(report,null,2));await t.close();console.log(JSON.stringify(report));}
