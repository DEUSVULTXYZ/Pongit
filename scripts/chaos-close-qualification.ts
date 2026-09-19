// Close only the fully published disposable two-game qualification.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createPublicClient,http} from 'viem';
import {chainTools} from './independent-chain-tools';
import {readHubDelegation} from '../shared/rooms-hub';
import {chaosQualificationRecord,verifyQualificationApp} from './chaos-qualification-record';
const {path,prefix,record:r}=await chaosQualificationRecord();
assert(['two-games-published','closing-qualified'].includes(r.state));
const proof=JSON.parse(await readFile('artifacts/drand/chaos-hosted.json','utf8'));
assert(proof.passed&&proof.mode==='exercise');assert.equal(proof.app,r.app);
const t=await chainTools(prefix);
try{
 const a=await verifyQualificationApp(t,prefix,r.app);
 const hub=await t.base.readContract({address:r.app,abi:a.abi,functionName:'hub'}) as any;
 let d=await readHubDelegation(t.base,hub,r.app);assert.equal(d.epoch,1n);assert(d.batchIndex>0n);
 assert([1,2].includes(d.status));
 const operation='close-qualified-two-games';
 const existing=(await t.db.query('SELECT id FROM il_lifecycle_jobs WHERE id=$1',[prefix+':'+operation])).rows[0];
 if(!existing){
 assert.equal(d.status,1,'Closed outside this journal; inspect before continuing');
 const node=createPublicClient({transport:http(r.node,{retryCount:0,timeout:15000})});
 assert.equal(await node.readContract({address:r.app,abi:a.abi,functionName:'activeCount'}),0n);
 for(const id of [1n,2n]){
  const [live,published]=await Promise.all([node,t.base].map(c=>c.readContract({address:r.app,abi:a.abi,functionName:'getSnapshot',args:[id]}))) as any[];
  assert.equal(live[2],3n);assert.equal(published[2],3n);assert.equal(live[6],published[6]);assert.equal(Math.max(live[12].scoreA,live[12].scoreB),7);assert.equal(live[12].scoreA,published[12].scoreA);assert.equal(live[12].scoreB,published[12].scoreB);
  const hashes=await Promise.all([node,t.base].map(c=>c.readContract({address:r.app,abi:a.abi,functionName:'resultHashes',args:[id]})));assert.equal(hashes[0],hashes[1]);
 }
 const health=await(await fetch(r.node+'/health',{signal:AbortSignal.timeout(15000)})).json();assert(!health.halted&&health.pendingDiffs===0,'All state must be published before closure');
 assert.equal(await t.base.readContract({address:r.app,abi:a.abi,functionName:'activeCount'}),0n);
 }
 // Also reconcile an already mined transaction after a lost response/restart.
 r.closeHash=(await t.write(operation,r.app,a.abi,'closeEngine')).transactionHash;
 d=await readHubDelegation(t.base,hub,r.app);assert.equal(d.status,2);r.state='closing-qualified';r.releaseAt=String(d.stakeUnlockAt);
 await writeFile(path+'.next',JSON.stringify(r,null,2),{mode:0o600});await rename(path+'.next',path);
 const out={at:new Date().toISOString(),app:r.app,epoch:1,batches:String(d.batchIndex),closeHash:r.closeHash,releaseAt:r.releaseAt};
 await writeFile('artifacts/drand/chaos-qualified-closure.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out));
}finally{await t.close();}
