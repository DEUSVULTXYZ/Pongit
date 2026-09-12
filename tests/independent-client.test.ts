import test from 'node:test';
import assert from 'node:assert/strict';
import {zeroAddress,toHex,type Address} from 'viem';
import {publicIndependentManifest,parseRoomReference,arenaReference} from '../shared/independent';
import {readIndependentLobby} from '../shared/independent-read';
import {confirmedContractRevert} from '../relayer/src/independent-writer';
import {abi as arenaAbi} from '../shared/abi-independent-IndependentArena';
import {abi as ratingsAbi} from '../shared/abi-independent-PublishedRatings';
import {decodePublishedEntry} from '../indexer/src/published-result';
import {encodeFunctionResult,decodeFunctionResult,zeroHash} from 'viem';
import {initial} from '../shared/physics-v2';
import {roomRoute} from '../shared/room-route';
import {ArenaRecovery,sameChaosPause,maintenanceContext} from '../shared/independent-recovery';
import {roomsLifecycleHubAbi} from '../shared/abi-rooms-lifecycle';
const address=(i:number)=>toHex(i,{size:20}) as Address;
const input={chainId:10143,hub:address(1),family:address(2),lobby:address(3),ratings:address(4),settlement:address(5),vault:address(6),market:address(7),profiles:address(8),privateData:address(9),pressureSigner:address(10),arenas:[11,12,13].map(i=>({app:address(i)})),genesis:1700000000,createdAt:'2026-09-12T12:00:00Z'};

test('readable stale snapshots cannot hide a publication failure or demand a new passkey',()=>{
 const recovery=new ArenaRecovery(),message=recovery.failure(Error('commit relay failed: 413 Payload Too Large'));
 assert.match(message,/publication recovery/);
 for(let i=0;i<20;i++)assert.equal(recovery.observed(),message);
 assert.equal(recovery.failure(Error('timeout')),message);
 assert.equal(recovery.observed(false,true),'');
 recovery.failure(Error('this session is over'));assert.equal(recovery.observed(true),'');
 recovery.failure(Error('network read failed'));assert.equal(recovery.observed(),'');
});

test('Chaos will not re-open an older published pause or deduplicate a new rally',()=>{
 const first={scoreA:1,scoreB:0,resumeAt:30n,awaitingServe:true},next={...first,scoreB:1,resumeAt:60n};
 assert.equal(sameChaosPause(next,first),false);assert.equal(sameChaosPause(first,{...first,awaitingServe:false}),false);
 assert.equal(sameChaosPause(first,{...first,resumeAt:31n}),false);assert.equal(sameChaosPause(next,next),true);
 assert.notEqual(maintenanceContext('round',[address(11),1n,10n,1,30n]),maintenanceContext('round',[address(11),1n,10n,2,60n]));
 assert.notEqual(maintenanceContext('room',{winner:address(20),proposal:0n}),maintenanceContext('room',{winner:address(21),proposal:0n}));
});
test('public deployment serialization excludes private provisioning and rejects foreign node URLs',()=>{
 const manifest=publicIndependentManifest({...input,privateKey:'PRIVATE',grant:'PRIVATE',tokens:['PRIVATE'],arenas:input.arenas.map(a=>({...a,privateKey:'PRIVATE'}))});
 assert(!JSON.stringify(manifest).includes('PRIVATE'));
 assert.throws(()=>publicIndependentManifest({...input,arenas:[...input.arenas.slice(0,2),input.arenas[0]]}));
 assert.throws(()=>publicIndependentManifest({...input,arenas:input.arenas.map(a=>({...a,node:'https://attacker.example'}))}));
 assert.throws(()=>publicIndependentManifest({...input,chainId:1}));
});
test('published result is readable without the closed engine after room rotation',async()=>{
 const m=publicIndependentManifest(input),player=address(20),opponent=address(21),last={app:address(11),id:14n,epoch:1n};
 const result={arena:last.app,id:last.id,epoch:last.epoch,a:player,b:opponent,winner:player,mode:0,ranked:true,status:3,scoreA:7,scoreB:2,hash:zeroHash};
 const state={...initial(zeroHash),scoreA:7,scoreB:2,finished:true};
 const base:any={getBlock:async()=>({number:100n,timestamp:200n}),readContract:async(c:any)=>{
  assert.equal(c.blockNumber,100n);const values:any={occupancy:8n,activeMatchOf:0n,grantOf:{key:zeroAddress},room:{id:8n,proposal:0n,members:[]},invitationPage:[[],0n],profileOf:{handle:'player',avatar:0},indexOf:1n,entry:{first:result,latest:result},boundMatch:last,getSnapshot:[14n,22n,3,player,opponent,zeroAddress,player,100n,1n,0n,0n,0n,state]};
  assert(c.functionName in values,c.functionName);return values[c.functionName];
 }};
 const view=await readIndependentLobby(base,m,player,undefined,last);
 assert.equal(view.publishedSnapshot?.state.scoreA,7);assert.equal(view.publishedSnapshot?.winner,player);assert.equal(view.binding,null);
});

test('closing and challenged arenas restore a partial published score without contacting the engine',async()=>{
 const m=publicIndependentManifest(input),player=address(20),opponent=address(21),binding={id:14n,epoch:1n,a:player,b:opponent};
 const fields=roomsLifecycleHubAbi.find(x=>x.name==='delegationOf')!.outputs[0].components;
 for(const status of [0,2,3]){
  const d:any=Object.fromEntries(fields.map(f=>[f.name,f.type==='address'?zeroAddress:f.type==='bytes32'?zeroHash:/^uint(8|16|32)$/.test(f.type)?0:0n]));
  Object.assign(d,{app:address(11),status,epoch:1n});
  const base:any={getBlock:async()=>({number:100n,timestamp:200n}),request:async(c:any)=>{
   assert.equal(c.method,'eth_call');assert.equal(c.params[0].to,m.hub);assert.equal(c.params[1],'0x64');
   return encodeFunctionResult({abi:roomsLifecycleHubAbi,functionName:'delegationOf',result:d});
  },readContract:async(c:any)=>{
   assert.equal(c.blockNumber,100n);
   const values:any={occupancy:8n,activeMatchOf:14n,grantOf:{key:address(30)},room:{id:8n,proposal:14n,members:[]},invitationPage:[[],0n],proposal:{id:14n,status:2},arenaOf:address(11),boundMatch:binding,profileOf:{handle:'player',avatar:0},getSnapshot:[14n,22n,2,player,opponent,zeroAddress,zeroAddress,100n,1n,0n,0n,0n,{...initial(zeroHash),scoreA:1,scoreB:0}]};
   assert(c.functionName in values,c.functionName);return values[c.functionName];
  }};
  const view=await readIndependentLobby(base,m,player);
  assert.equal(view.delegation?.status,status);assert.equal(view.recoverySnapshot?.state.scoreA,1);
  assert.equal(view.recoverySnapshot?.phase,2);assert.equal(view.recoverySnapshot?.winner,zeroAddress);assert.equal(view.published,null);
 }
});
test('indexer entry decoder matches the exact Solidity ABI and rejects truncated state',()=>{
 const result={arena:address(11),epoch:2n,id:123n,a:address(20),b:address(21),winner:address(20),mode:1,ranked:true,status:3,scoreA:7,scoreB:6,hash:toHex(12,{size:32})};
 const expected={first:result,latest:result,at:1789230000n,finality:false};
 const encoded=encodeFunctionResult({abi:ratingsAbi,functionName:'entry',result:expected});
 const decoded=decodePublishedEntry(encoded),abiDecoded=decodeFunctionResult({abi:ratingsAbi,functionName:'entry',data:encoded});
 assert.equal(decoded.first.id,String(abiDecoded.first.id));assert.equal(decoded.latest.scoreB,6);assert.equal(decoded.latest.mode,1);assert.equal(decoded.finality,false);
 assert.throws(()=>decodePublishedEntry(encoded.slice(0,-2)));assert.throws(()=>decodePublishedEntry('0x'));
});
test('room and match references never resolve across deployments or epochs',()=>{
 assert.equal(parseRoomReference(input.lobby+':12',input.lobby),12n);
 for(const value of [input.family+':12',input.lobby+':0',input.lobby+':12:4','12'])assert.throws(()=>parseRoomReference(value,input.lobby));
 assert.notEqual(arenaReference(address(11),1,12),arenaReference(address(11),2,12));
});
test('room deep links accept an escaped colon exactly once and reject injected path segments',()=>{
 const id=input.lobby+':12';assert.deepEqual(roomRoute(id),roomRoute(encodeURIComponent(id)));
 assert.equal(roomRoute(id)?.id,id);assert.equal(roomRoute('0x'+'a'.repeat(64))?.kind,'legacy');
 for(const bad of [encodeURIComponent(encodeURIComponent(id)),id+'%2Fanything',id+'%3Fadmin=true','%bad',input.lobby+':-1'])assert.equal(roomRoute(bad),null);
});
test('temporary RPC failures cannot retire an unsigned action as a contract revert',()=>{
 for(const e of [Error('429'),{name:'TimeoutError'},{name:'HttpRequestError',cause:{message:'receipt absent'}}])assert.equal(confirmedContractRevert(e),false);
 assert.equal(confirmedContractRevert({cause:{name:'ContractFunctionRevertedError'}}),true);
});
test('a rotated room never reads another match from a reused arena; all reads use one block',async()=>{
 const m=publicIndependentManifest(input),player=address(20),reads:any[]=[];
 const base:any={getBlock:async()=>({number:100n,timestamp:200n}),readContract:async(c:any)=>{
  reads.push(c);assert.equal(c.blockNumber,100n);
  const values:any={occupancy:8n,activeMatchOf:0n,grantOf:{key:zeroAddress},room:{id:8n,proposal:14n,members:[]},invitationPage:[[],0n],proposal:{id:14n,status:3},arenaOf:address(11),boundMatch:{id:15n,epoch:2n},profileOf:{handle:'player',avatar:0},indexOf:1n,entry:{first:{id:14n}}};
  assert(c.functionName in values,c.functionName);return values[c.functionName];
 }};
 const view=await readIndependentLobby(base,m,player);
 assert.equal(view.binding,null);assert.equal(view.app,null);assert.equal(view.published.first.id,14n);assert(reads.length>5);
});
