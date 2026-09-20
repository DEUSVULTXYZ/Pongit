import test from 'node:test';
import assert from 'node:assert/strict';
import {zeroAddress,toHex,type Address} from 'viem';
import {familyGrantHash,lobbyCommandContext} from '../shared/independent-command';
import {publicIndependentManifest,type FamilyGrant} from '../shared/independent';
const address=(i:number)=>toHex(i,{size:20}) as Address;
const m=publicIndependentManifest({chainId:10143,hub:address(1),family:address(2),lobby:address(3),ratings:address(4),settlement:address(5),vault:address(6),market:address(7),profiles:address(8),privateData:address(9),pressureSigner:address(10),arenas:[11,12,13].map(i=>({app:address(i)})),genesis:1,createdAt:'2026-09-20'});
const grant:FamilyGrant={player:address(20),key:address(21),issuedAt:10n,expires:500n,revision:2n};
test('command authorization and nonce share a block and run in parallel without digest RPC',async()=>{
 const calls:string[]=[];let release!:()=>void;const gate=new Promise<void>(r=>release=r);
 const base:any={getBlock:async()=>({number:77n,timestamp:450n}),readContract:async({functionName,args,blockNumber}:any)=>{
  assert.equal(blockNumber,77n);calls.push(functionName);if(calls.length===2)release();await gate;
  if(functionName==='grantOf'){assert.equal(args[0],grant.player);return grant;}
  assert.equal(functionName,'commandNonces');assert.equal(args[0],familyGrantHash(m,grant));return 19n;
 }};
 const context=await lobbyCommandContext(base,m,grant);assert.equal(context.nonce,19n);assert.equal(context.deadline,500n);assert.equal(calls.length,2);
});
test('revocation, replaced key and expiration cannot yield a command context',async()=>{
 for(const current of [{...grant,key:zeroAddress},{...grant,key:address(30)},{...grant,revision:3n},{...grant,issuedAt:11n}]){
  const base:any={getBlock:async()=>({number:77n,timestamp:450n}),readContract:async({functionName}:any)=>functionName==='grantOf'?current:0n};
  await assert.rejects(lobbyCommandContext(base,m,grant),/Renew arcade session/);
 }
 const base:any={getBlock:async()=>({number:77n,timestamp:500n}),readContract:async({functionName}:any)=>functionName==='grantOf'?grant:0n};
 await assert.rejects(lobbyCommandContext(base,m,grant),/Renew arcade session/);
});
test('an unavailable reader propagates its error rather than declaring session expiry',async()=>{
 const error=Error('RPC unavailable'),base:any={getBlock:async()=>({number:77n,timestamp:450n}),readContract:async()=>{throw error;}};
 await assert.rejects(lobbyCommandContext(base,m,grant),e=>e===error);
});
test('the grant digest commits to its deployment, identity, timing and revision',()=>{
 const hash=familyGrantHash(m,grant);
 for(const change of [{player:address(30)},{key:address(30)},{issuedAt:11n},{expires:501n},{revision:3n}])assert.notEqual(familyGrantHash(m,{...grant,...change}),hash);
 assert.notEqual(familyGrantHash({...m,family:address(30)},grant),hash);
});
