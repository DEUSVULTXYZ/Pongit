// Resume the exact registered-scalar probe once our rejected probe releases its
// validator stake. This never closes a production game or creates another app.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {parseAbi,zeroHash,type Address} from 'viem';
import {chainTools} from './independent-chain-tools';
import {readHubDelegation} from '../shared/rooms-hub';
assert.equal(process.env.PONG_DRAND_RESUME,'release-known-probe');
const path='/secrets/drand-probe-scalars-20260913.json';
const oldPath='/secrets/drand-probe-recoverable-20260913.json';
const r=JSON.parse(await readFile(path,'utf8')),old=JSON.parse(await readFile(oldPath,'utf8'));
const app=(r.app||r.error?.match(/delegateAll reverted on (0x[\da-f]{40})/i)?.[1]) as Address;
assert.equal(app,'0x6706442df3d8363d14d0aa40e7ae52256df55b18');
assert.equal(old.app,'0xe0035203939bcbe0536d23d8a74751cffd29c06b');
const artifact=JSON.parse(await readFile('contracts/out/DrandHostedProbe.sol/DrandHostedProbe.json','utf8'));
const t=await chainTools('drand-qualification-20260913');
const save=async()=>{await writeFile(path+'.next',JSON.stringify(r,null,2),{mode:0o600});await rename(path+'.next',path);};
try{
 const hub=await t.base.readContract({address:app,abi:artifact.abi,functionName:'hub'}) as Address;
 let d=await readHubDelegation(t.base,hub,old.app);assert.equal(d.epoch,1n);assert.equal(d.batchIndex,0n);
 assert.equal(old.state,'closing');
 const deadline=Date.now()+65*60_000;
 console.log(JSON.stringify({phase:'waiting-for-probe-release',app:old.app,releaseAt:String(d.stakeUnlockAt)}));
 while(d.status!==0){
  assert.equal(d.status,2,'Probe challenge requires inspection');assert(Date.now()<deadline,'Release wait exceeded');
  const now=(await t.base.getBlock()).timestamp;
  if(now>=d.stakeUnlockAt){
   assert.deepEqual(await t.base.readContract({address:old.app,abi:artifact.abi,functionName:'result'}),[zeroHash,zeroHash,0n]);
   const receipt=await t.write('release-unpublished-drand-probe',hub,parseAbi(['function releaseStake(address,bytes32)']),'releaseStake',[old.app,zeroHash]);
   old.releaseHash=receipt.transactionHash;
   d=await readHubDelegation(t.base,hub,old.app);assert.equal(d.status,0);break;
  }
  await new Promise(resolve=>setTimeout(resolve,Math.min(30000,Number(d.stakeUnlockAt-now)*1000+1000)));
  d=await readHubDelegation(t.base,hub,old.app);
 }
 old.state='released';if(old.tx)old.tx.state='inexecutable-closed-epoch';
 await writeFile(oldPath+'.next',JSON.stringify(old,null,2),{mode:0o600});await rename(oldPath+'.next',oldPath);
 const before=await readHubDelegation(t.base,hub,app);
 if(before.status===0)await t.write('open-scalar-drand-probe',app,artifact.abi,'openProbe');
 const opened=await readHubDelegation(t.base,hub,app);assert.equal(opened.status,1);assert.equal(opened.epoch,1n);
 r.app=app;r.openedEpoch=String(opened.epoch);await save();
 const lookup=await fetch('https://control.interludelayer.xyz/sessions/'+app);let session:any=await lookup.json();
 if(lookup.status===404){
  assert(!r.nodeRequestAt,'Inspect the earlier uncertain node creation');r.nodeRequestAt=new Date().toISOString();await save();
  const response=await fetch('https://control.interludelayer.xyz/sessions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({app}),signal:AbortSignal.timeout(60000)});
  session=await response.json();r.nodeHttp=response.status;await save();assert(response.ok);
 }else assert(lookup.ok);
 r.node=session.url||session.node;assert(r.node?.startsWith('https://'));r.state='answered';await save();
 const report={at:new Date().toISOString(),app,node:r.node,epoch:r.openedEpoch,releasedProbe:old.app,releaseHash:old.releaseHash};
 await writeFile('artifacts/drand/resumed.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await t.close();}
