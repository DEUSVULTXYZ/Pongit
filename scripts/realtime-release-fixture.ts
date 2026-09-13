// Release one documented, completed Classic rehearsal. Never close production or an active session.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {zeroHash} from 'viem';
import {chainTools} from './independent-chain-tools';
import {readHubDelegation} from '../shared/rooms-hub';
import {abi as arenaAbi} from '../shared/abi-independent-IndependentArena';
const reference=JSON.parse(await readFile('docs/evidence/independent/compact-verification.json','utf8')).matches[0];
assert.equal(reference.mode,0);assert.equal(reference.app,'0x4ce249014a54A8260Fe0b8C5A6fde3E0c9c8FfB3');
const t=await chainTools('realtime-20260913'),hub='0x3Ef8327F69e09cf721772F345e2A887eA22cD595';
try{
 const d=await readHubDelegation(t.base,hub,reference.app);
 if(d.status===0){console.log('Documented Classic fixture is already released');}
 else{
  assert.equal(d.status,2,'Only release an already closed session');assert.equal(String(d.epoch),reference.epoch);
  assert((await t.base.getBlock()).timestamp>=d.stakeUnlockAt);
  const bound:any=await t.base.readContract({address:reference.app,abi:arenaAbi,functionName:'boundMatch'});
  assert.equal(String(bound.id),reference.id);assert.equal(String(bound.epoch),reference.epoch);
  const result=await t.base.readContract({address:reference.app,abi:arenaAbi,functionName:'resultHashes',args:[BigInt(reference.id)]});assert.equal(result,reference.hash);
  const abi=JSON.parse(await readFile('artifacts/realtime/InterludeHub.json','utf8')).abi;
  const receipt=await t.write('release-completed-classic-fixture',hub,abi,'releaseStake',[reference.app,zeroHash]);
  await writeFile('artifacts/realtime/released-fixture.json',JSON.stringify({at:new Date().toISOString(),app:reference.app,hash:receipt.transactionHash,block:String(receipt.blockNumber)}));
 }
}finally{await t.close();}
