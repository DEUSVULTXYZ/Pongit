import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {parseAbi,zeroHash} from 'viem';
import {chainTools} from './independent-chain-tools';
import {readHubDelegation} from '../shared/rooms-hub';
import {chaosQualificationRecord,verifyQualificationApp} from './chaos-qualification-record';
assert.equal(process.env.PONG_CHAOS_RELEASE,'closed-qualified-fixture');
const {path,prefix,record:r}=await chaosQualificationRecord();
assert(['closing-qualified','released-qualified'].includes(r.state));
const t=await chainTools(prefix);
try{
 const a=await verifyQualificationApp(t,prefix,r.app);
 const hub=await t.base.readContract({address:r.app,abi:a.abi,functionName:'hub'}),d=await readHubDelegation(t.base,hub as any,r.app);
 assert.equal(d.epoch,1n);assert(d.batchIndex>0n);
 assert.equal(await t.base.readContract({address:r.app,abi:a.abi,functionName:'activeCount'}),0n);
 for(const id of [1n,2n]){const s:any=await t.base.readContract({address:r.app,abi:a.abi,functionName:'getSnapshot',args:[id]});assert.equal(s[2],3n);assert.equal(Math.max(s[12].scoreA,s[12].scoreB),7);}
 const operation='release-qualified-chaos';
 if(d.status!==0){assert.equal(d.status,2);assert((await t.base.getBlock()).timestamp>=d.stakeUnlockAt,'The actual contest window has not ended');}
 else assert((await t.db.query('SELECT id FROM il_lifecycle_jobs WHERE id=$1',[prefix+':'+operation])).rows[0],'Released outside this journal; inspect before continuing');
 // Do not leave a mined operation pending merely because hub state changed.
 r.releaseHash=(await t.write(operation,hub as any,parseAbi(['function releaseStake(address,bytes32)']),'releaseStake',[r.app,zeroHash])).transactionHash;
 assert.equal((await readHubDelegation(t.base,hub as any,r.app)).status,0);r.state='released-qualified';
 await writeFile(path+'.next',JSON.stringify(r,null,2),{mode:0o600});await rename(path+'.next',path);
 const report={at:new Date().toISOString(),app:r.app,releaseHash:r.releaseHash,state:r.state};await writeFile('artifacts/drand/chaos-qualified-release.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await t.close();}
