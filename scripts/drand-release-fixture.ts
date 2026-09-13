// Release the completed HTTPS browser fixture documented on 2026-09-12.
// This is not the current or archived user game and never rewrites its result.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {parseAbi,zeroHash} from 'viem';
import {abi} from '../shared/abi-independent-IndependentArena';
import {readHubDelegation} from '../shared/rooms-hub';
import {chainTools} from './independent-chain-tools';
assert.equal(process.env.PONG_DRAND_RELEASE,'completed-browser-fixture');
const app='0xf44c1Eb74247547214c1901d981dd5E59601994A';
const id=340282366920938463463374607431768211511n;
const t=await chainTools('drand-qualification-20260913');
try{
 const hub=await t.base.readContract({address:app,abi,functionName:'hub'});
 const d=await readHubDelegation(t.base,hub,app);
 const b=await t.base.readContract({address:app,abi,functionName:'boundMatch'});
 assert.equal(b.id,id);assert.equal(b.epoch,2n);
 const s=await t.base.readContract({address:app,abi,functionName:'getSnapshot',args:[id]});
 assert.equal(s[2],3n);assert.equal(s[6].toLowerCase(),'0xa3402d5a1ba3bb71ad3b53cb95facb8c4216f4e8');
 assert.equal(s[12].scoreA,7);assert.equal(s[12].scoreB,6);
 const hash=await t.base.readContract({address:app,abi,functionName:'resultHashes',args:[id]});assert.notEqual(hash,zeroHash);
 let receipt;
 if(d.status!==0){
  assert.equal(d.status,2);assert.equal(d.epoch,2n);assert((await t.base.getBlock()).timestamp>=d.stakeUnlockAt);
  receipt=await t.write('release-completed-browser-fixture',hub,parseAbi(['function releaseStake(address,bytes32)']),'releaseStake',[app,zeroHash]);
 }
 assert.equal((await readHubDelegation(t.base,hub,app)).status,0);
 assert.equal(await t.base.readContract({address:app,abi,functionName:'resultHashes',args:[id]}),hash);
 const report={at:new Date().toISOString(),app,id:String(id),epoch:2,score:[7,6],resultHash:hash,released:true,transaction:receipt?.transactionHash};
 await writeFile('artifacts/drand/fixture-release.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await t.close();}
