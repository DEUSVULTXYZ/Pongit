// One explicitly selected human arena, after its production observer releases
// and seals it. This does not perform or compete with release/finalization.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createPublicClient,http,keccak256,zeroHash,type Address} from 'viem';
import {chainTools} from './independent-chain-tools';
import {readHubDelegation} from '../shared/rooms-hub';
import {publicIndependentManifest} from '../shared/independent';
import {abi as arenaAbi} from '../shared/abi-independent-ReusableEventsArena';
import {abi as lobbyAbi} from '../shared/abi-independent-ReusableEventsLobby';
import {abi as verifierAbi} from '../shared/abi-independent-PublishedResultVerifier';
import {abi as hubAbi} from '../shared/abi-independent-IInterludeHub';
import {retryOperatorContention} from '../shared/operator-contention';
assert.equal(process.env.PONG_HUMAN_RENEWAL_TEST,'one-reviewed-production-arena');
assert.equal(process.getuid?.(),1000);
const raw=JSON.parse(await readFile(process.env.PONG_INDEPENDENT_MANIFEST!,'utf8'));
assert.equal(raw.production,true);assert.equal(raw.rulesVersion,14);assert.equal(raw.status,'sealed');
const m=publicIndependentManifest(raw),app=process.env.PONG_RENEWAL_APP as Address;
assert(m.arenas.some(a=>a.app.toLowerCase()===app?.toLowerCase()));
const old=BigInt(process.env.PONG_RENEWAL_EPOCH!);assert(old>0n);
const label=process.env.PONG_RENEWAL_RUN!;assert(/^[a-z0-9-]{1,32}$/.test(label));
const out=`artifacts/independent-candidate/renewal-${label}.json`;
await mkdir('artifacts/independent-candidate',{recursive:true});
const report:any={at:new Date().toISOString(),lobby:m.lobby,app,previousEpoch:String(old),passed:false,
 scope:'Actual release/seal/renewal and verified hosted empty epoch. A subsequent published game is a separate gate.'};
await writeFile(out,JSON.stringify(report),{flag:'wx'});
const save=()=>writeFile(out,JSON.stringify(report,null,2));
const t=await chainTools('human-release-'+label);
const read=(address:Address,abi:any,functionName:string,args:readonly unknown[]=[])=>t.base.readContract({address,abi,functionName,args})as Promise<any>;
const pause=()=>new Promise(r=>setTimeout(r,3000));
try{
 const end=Date.now()+30*60_000;
 const code=await t.base.getCode({address:app});assert(code&&code!=='0x');report.runtimeHash=keccak256(code);
 let sealed=false;
 while(Date.now()<end){
  const d=await readHubDelegation(t.base,m.hub,app);assert.equal(d.epoch,old,'Another opener already changed the epoch');
  assert([0,2].includes(d.status),'Only a previously closed arena is approved');
  if(d.status===0){
   const root=await read(app,arenaAbi,'resultCommitment'),final=await read(m.resultVerifier!,verifierAbi,'finalizedRoots',[app,old]);
   if(final[0]!==zeroHash){
    assert.equal(root[0],old);assert.equal(root[2],final[0]);assert.equal(root[1],final[1]);
    assert.equal(await read(m.lobby,lobbyAbi,'reservedMatch',[app]),0n);
    const current=await read(app,arenaAbi,'currentMatch');
    if(current[1])assert((await read(app,arenaAbi,'getSnapshot',[current[1]])).phase>=3n);
    report.released={observedAt:new Date().toISOString(),epoch:String(old),root:root[2],count:root[1]};sealed=true;await save();break;
   }
  }
  await pause();
 }
 assert(sealed,'Production release and sealed root did not complete within the bounded wait');
 const validator=await read(m.hub,hubAbi,'defaultValidator'),terms=await read(m.hub,hubAbi,'termsOf',[validator]);
 assert.equal(terms.delegationFee,0n,'Review changed provider opening fees');
 const receipt=await retryOperatorContention(()=>t.write('open-'+app.toLowerCase()+'-'+String(old+1n),m.lobby,lobbyAbi,'openReusableArena',[app],0n));
 report.open={hash:receipt.transactionHash,block:String(receipt.blockNumber),gasUsed:String(receipt.gasUsed)};await save();
 const arena=m.arenas.find(a=>a.app.toLowerCase()===app.toLowerCase())!,node=createPublicClient({transport:http(arena.node,{retryCount:0,timeout:10000})});
 let ready=false;
 while(Date.now()<end){
  const d=await readHubDelegation(t.base,m.hub,app);assert.equal(d.status,1);assert.equal(d.epoch,old+1n);
  try{
   const session:any=await node.request({method:'interlude_session',params:[]}as any);
   assert.equal(session.app.toLowerCase(),app.toLowerCase());assert.equal(BigInt(session.epoch),d.epoch);assert.equal(BigInt(session.baseBlock),d.baseBlock);
   const root=await read(app,arenaAbi,'resultCommitment');assert.equal(root[0],d.epoch);assert.equal(root[1],0);
   assert.deepEqual(await node.readContract({address:app,abi:arenaAbi,functionName:'resultCommitment'}),root);
   assert.deepEqual(await node.readContract({address:app,abi:arenaAbi,functionName:'currentMatch'}),[0n,0n]);
   const response=await fetch('https://pongit.xyz/api/independent/config',{signal:AbortSignal.timeout(10000)});assert(response.ok);
   const config:any=await response.json();assert.equal(config.manifest.lobby.toLowerCase(),m.lobby.toLowerCase());
   const health=config.arenas.find((a:any)=>a.app.toLowerCase()===app.toLowerCase());assert(health?.online&&health.stage==='available'&&BigInt(health.epoch)===d.epoch);
   report.hosted={at:new Date().toISOString(),epoch:String(d.epoch),baseBlock:String(d.baseBlock),expiresAt:String(d.expiresAt),emptyRoot:root[2]};ready=true;break;
  }catch{await pause();}
 }
 assert(ready,'New hosted epoch did not become available');assert.equal(keccak256((await t.base.getCode({address:app}))!),report.runtimeHash);
 report.passed=true;
}catch(e){report.error=String((e as any).shortMessage??(e as Error).message).split('\n')[0].replace(/0x[\da-f]{90,}/gi,'[omitted]').slice(0,300);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await save();await t.close();console.log(JSON.stringify({out,passed:report.passed,error:report.error}));}
