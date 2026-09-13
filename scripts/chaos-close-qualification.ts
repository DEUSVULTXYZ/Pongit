// Close only the fully published disposable two-game qualification.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createPublicClient,http} from 'viem';
import {chainTools} from './independent-chain-tools';
import {readHubDelegation} from '../shared/rooms-hub';
const path='/secrets/chaos-events-qualification-20260913.json',r=JSON.parse(await readFile(path,'utf8'));
assert.equal(r.app,'0x3c4e786ce22f26ba8c41eb2d4e8ac936ee05117e');assert(['two-games-published','closing-qualified'].includes(r.state));
const t=await chainTools('chaos-events-qualification-20260913'),a=await t.artifact('PongChaosEvents');
try{
 const hub=await t.base.readContract({address:r.app,abi:a.abi,functionName:'hub'}) as any;
 const node=createPublicClient({transport:http(r.node,{retryCount:0,timeout:15000})});
 assert.equal(await node.readContract({address:r.app,abi:a.abi,functionName:'activeCount'}),0n);
 for(const id of [1n,2n]){
  const [live,published]=await Promise.all([node,t.base].map(c=>c.readContract({address:r.app,abi:a.abi,functionName:'getSnapshot',args:[id]}))) as any[];
  assert.equal(live[2],3n);assert.equal(published[2],3n);assert.equal(live[6],published[6]);assert.equal(live[12].scoreA,7);assert.equal(published[12].scoreA,7);assert.equal(live[12].scoreB,published[12].scoreB);
  const hashes=await Promise.all([node,t.base].map(c=>c.readContract({address:r.app,abi:a.abi,functionName:'resultHashes',args:[id]})));assert.equal(hashes[0],hashes[1]);
 }
 let d=await readHubDelegation(t.base,hub,r.app);assert.equal(d.epoch,1n);assert(d.batchIndex>=5n);
 if(d.status===1)r.closeHash=(await t.write('close-qualified-two-games',r.app,a.abi,'closeEngine')).transactionHash;
 d=await readHubDelegation(t.base,hub,r.app);assert.equal(d.status,2);r.state='closing-qualified';r.releaseAt=String(d.stakeUnlockAt);
 await writeFile(path+'.next',JSON.stringify(r,null,2),{mode:0o600});await rename(path+'.next',path);
 const out={at:new Date().toISOString(),app:r.app,epoch:1,batches:String(d.batchIndex),closeHash:r.closeHash,releaseAt:r.releaseAt};
 await writeFile('artifacts/drand/chaos-qualified-closure.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out));
}finally{await t.close();}
