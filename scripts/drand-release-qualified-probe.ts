import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {parseAbi,zeroHash,type Address} from 'viem';
import {chainTools} from './independent-chain-tools';
import {readHubDelegation} from '../shared/rooms-hub';
assert.equal(process.env.PONG_DRAND_RELEASE,'qualified-scalar-probe');
const path='/secrets/drand-probe-scalars-20260913.json',record=JSON.parse(await readFile(path,'utf8'));
const report=JSON.parse(await readFile('artifacts/drand/scalar-hosted.json','utf8'));
assert.equal(record.app,'0x6706442df3d8363d14d0aa40e7ae52256df55b18');assert.equal(record.app,report.app);assert(report.passed);
const a=JSON.parse(await readFile('contracts/out/DrandHostedProbe.sol/DrandHostedProbe.json','utf8'));
const t=await chainTools('drand-qualification-20260913');
try{
 const app=record.app as Address,hub=await t.base.readContract({address:app,abi:a.abi,functionName:'hub'}) as Address;
 let d=await readHubDelegation(t.base,hub,app);assert.equal(d.epoch,1n);assert.equal(d.batchIndex,1n);
 const state=await t.base.readContract({address:app,abi:a.abi,functionName:'result'}) as readonly [string,string,bigint];
 assert.deepEqual([state[0],state[1],String(state[2])],report.published);
 if(d.status!==0){assert.equal(d.status,2);assert((await t.base.getBlock()).timestamp>=d.stakeUnlockAt);
  const receipt=await t.write('release-qualified-drand-probe',hub,parseAbi(['function releaseStake(address,bytes32)']),'releaseStake',[app,zeroHash]);record.releaseHash=receipt.transactionHash;}
 d=await readHubDelegation(t.base,hub,app);assert.equal(d.status,0);record.state='released-qualified';
 await writeFile(path+'.next',JSON.stringify(record,null,2),{mode:0o600});await rename(path+'.next',path);
 const result={at:new Date().toISOString(),app,epoch:'1',batch:'1',releaseHash:record.releaseHash,state:record.state};
 await writeFile('artifacts/drand/qualified-release.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await t.close();}
