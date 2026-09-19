// Separate approval from forceClose. This operation neither renews nor opens admission.
import assert from 'node:assert/strict';
import {parseAbi,zeroHash} from 'viem';
import {chainTools} from './independent-chain-tools';
import {readHubDelegation} from '../shared/rooms-hub';
assert.equal(process.env.PONG_HUMAN_RECOVERY,'approved-release-epoch-6');
const app='0x78d3341e3452d7ec1add9371de3008639eed8eb0',hub='0x3Ef8327F69e09cf721772F345e2A887eA22cD595';
const config=await(await fetch('https://pongit.xyz/api/interlude/config',{signal:AbortSignal.timeout(12000)})).json();
assert.equal(config.app.toLowerCase(),app);
assert.equal(config.admission,false,'Keep admissions closed');
assert.equal(config.maintenance?.operatorHold,true,'Keep automatic lifecycle writes held');
const t=await chainTools('human-recovery-20260919');
try{
 const close=(await t.db.query('SELECT hash,status FROM il_lifecycle_jobs WHERE id=$1',['human-recovery-20260919:epoch6-force-close'])).rows[0];
 assert.equal(close?.status,'confirmed','Reconcile the approved closure first');
 assert.equal((await t.base.getTransactionReceipt({hash:close.hash})).status,'success');
 const d=await readHubDelegation(t.base,hub,app);assert.equal(d.epoch,6n);
 assert([0,2].includes(d.status),'Active or challenged delegation requires a new review');
 if(d.status===2){
  assert.equal(d.batchIndex,190n,'Published state changed; inspect before releasing');
  assert((await t.base.getBlock()).timestamp>=d.stakeUnlockAt,'The actual hub challenge window has not ended');
 }else{
  // A repeated invocation may only reconcile our existing exact operation.
  const existing=(await t.db.query('SELECT id FROM il_lifecycle_jobs WHERE id=$1',['human-recovery-20260919:epoch6-release'])).rows[0];
  assert(existing,'Delegation was released elsewhere; inspect rather than create a new operation');
 }
 const receipt=await t.write('epoch6-release',hub,parseAbi(['function releaseStake(address,bytes32)']),'releaseStake',[app,zeroHash]);
 const after=await readHubDelegation(t.base,hub,app);assert.equal(after.status,0);assert.equal(after.epoch,6n);
 console.log(JSON.stringify({app,epoch:'6',action:'releaseStake',hash:receipt.transactionHash,block:String(receipt.blockNumber),gasUsed:String(receipt.gasUsed),at:new Date().toISOString()}));
}finally{await t.close();}
