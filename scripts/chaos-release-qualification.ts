import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {parseAbi,zeroHash} from 'viem';
import {chainTools} from './independent-chain-tools';
import {readHubDelegation} from '../shared/rooms-hub';
assert.equal(process.env.PONG_CHAOS_RELEASE,'closed-qualified-fixture');
const path='/secrets/chaos-events-qualification-20260913.json',r=JSON.parse(await readFile(path,'utf8'));
assert.equal(r.app,'0x3c4e786ce22f26ba8c41eb2d4e8ac936ee05117e');assert(['closing-qualified','released-qualified'].includes(r.state));
const a=JSON.parse(await readFile('contracts/out/PongChaosEvents.sol/PongChaosEvents.json','utf8'));
const t=await chainTools('chaos-events-qualification-20260913');
try{
 const hub=await t.base.readContract({address:r.app,abi:a.abi,functionName:'hub'}),d=await readHubDelegation(t.base,hub as any,r.app);
 assert.equal(d.epoch,1n);assert.equal(d.batchIndex,5n);
 for(const id of [1n,2n]){const s:any=await t.base.readContract({address:r.app,abi:a.abi,functionName:'getSnapshot',args:[id]});assert.equal(s[2],3n);assert.deepEqual([s[12].scoreA,s[12].scoreB],[7,6]);}
 if(d.status!==0){assert.equal(d.status,2);assert((await t.base.getBlock()).timestamp>=d.stakeUnlockAt,'The actual contest window has not ended');
  r.releaseHash=(await t.write('release-qualified-chaos',hub as any,parseAbi(['function releaseStake(address,bytes32)']),'releaseStake',[r.app,zeroHash])).transactionHash;}
 assert.equal((await readHubDelegation(t.base,hub as any,r.app)).status,0);r.state='released-qualified';
 await writeFile(path+'.next',JSON.stringify(r,null,2),{mode:0o600});await rename(path+'.next',path);
 const report={at:new Date().toISOString(),app:r.app,releaseHash:r.releaseHash,state:r.state};await writeFile('artifacts/drand/chaos-qualified-release.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await t.close();}
