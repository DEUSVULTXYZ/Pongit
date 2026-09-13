// Close only the unusable, never-published qualification probe. Keep its journal.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createPublicClient,http,zeroHash,parseAbi} from 'viem';
import {readHubDelegation} from '../shared/rooms-hub';
import {chainTools} from './independent-chain-tools';
assert.equal(process.env.PONG_DRAND_CLOSE,'failed-storage-probe');
const path='/secrets/drand-probe-recoverable-20260913.json';
const r=JSON.parse(await readFile(path,'utf8'));
assert.equal(r.app,'0xe0035203939bcbe0536d23d8a74751cffd29c06b');
const abi=parseAbi(['function hub() view returns(address)','function closeProbe()','function result() view returns(bytes32,bytes32,uint64)']);
const t=await chainTools('drand-qualification-20260913');
try{
 const hub=await t.base.readContract({address:r.app,abi,functionName:'hub'});
 let d=await readHubDelegation(t.base,hub,r.app);assert.equal(d.epoch,1n);assert.equal(d.batchIndex,0n);
 assert.deepEqual(await t.base.readContract({address:r.app,abi,functionName:'result'}),[zeroHash,zeroHash,0n]);
 if(d.status===1){
  const node=createPublicClient({transport:http(r.node)});
  assert.deepEqual(await node.readContract({address:r.app,abi,functionName:'result'}),[zeroHash,zeroHash,0n]);
  const health:any=await fetch(r.node+'/health').then(r=>r.json());assert.equal(health.pendingDiffs,0);
  const receipt=await t.write('close-unpublished-drand-probe',r.app,abi,'closeProbe');r.closeHash=receipt.transactionHash;
  d=await readHubDelegation(t.base,hub,r.app);
 }
 assert.equal(d.status,2);r.state='closing';if(r.tx)r.tx.state='quarantined-closing';
 r.releaseAt=String(d.stakeUnlockAt);await writeFile(path+'.next',JSON.stringify(r,null,2),{mode:0o600});await rename(path+'.next',path);
 const report={at:new Date().toISOString(),app:r.app,hash:r.closeHash,epoch:1,batch:0,releaseAt:new Date(Number(d.stakeUnlockAt)*1000).toISOString()};
 await writeFile('artifacts/drand/failed-probe-closed.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await t.close();}
