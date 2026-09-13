// Close/release only the completed integration fixture, never the live game.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createPublicClient,http,parseAbi,zeroHash} from 'viem';
import {chainTools} from './independent-chain-tools';
import {readHubDelegation} from '../shared/rooms-hub';
import {roomsEventsAbi as abi} from '../shared/abi-PongChaosEvents';
const action=process.argv[2];assert(['close','release'].includes(action));assert.equal(process.env.PONG_CHAOS_QUALIFY,'isolated-hosted-testnet');
const prefix='chaos-events-integration-20260913',file=`/secrets/${prefix}.json`,r=JSON.parse(await readFile(file,'utf8'));
assert.equal(r.app,'0x4ace43735d1e5b0aa9b2d54a76ea4ac99089bb91');
const full=JSON.parse(await readFile('artifacts/drand/events-live-2.json','utf8')),browser=JSON.parse(await readFile('artifacts/drand/real-browser-1/report.json','utf8')),parallel=JSON.parse(await readFile('artifacts/drand/chaos-hosted.json','utf8'));
assert(full.passed&&browser.passed&&parallel.passed);assert.equal(parallel.mode,'exercise');assert.equal(parallel.app,r.app);
const ids=[1n,2n,202609131010n,202609131011n,...full.matches.map((m:any)=>BigInt(m.id)),...browser.matches.map((m:any)=>BigInt(m.id))];
const t=await chainTools(prefix),hub=await t.base.readContract({address:r.app,abi,functionName:'hub'});
const report:any={at:new Date().toISOString(),app:r.app,action,results:[]};
try{
 const d=await readHubDelegation(t.base,hub,r.app);assert.equal(d.epoch,1n);assert.equal(await t.base.readContract({address:r.app,abi,functionName:'activeCount'}),0n);
 const node=createPublicClient({transport:http(r.node,{retryCount:0,timeout:12000})});
 for(const id of ids){const s=await t.base.readContract({address:r.app,abi,functionName:'getSnapshot',args:[id]});assert.equal(s[2],3n);assert.equal(Math.max(s[12].scoreA,s[12].scoreB),7);
  const hash=await t.base.readContract({address:r.app,abi,functionName:'resultHashes',args:[id]});assert.notEqual(hash,zeroHash);
  if(action==='close'){assert.equal(await node.readContract({address:r.app,abi,functionName:'resultHashes',args:[id]}),hash);}
  report.results.push({id:String(id),score:[s[12].scoreA,s[12].scoreB],winner:s[6],hash});
 }
 if(action==='close'){
  if(d.status===1){const health:any=await(await fetch(r.node+'/health')).json();assert(!health.halted&&health.pendingDiffs===0);assert.equal(await node.readContract({address:r.app,abi,functionName:'activeCount'}),0n);
   r.closeHash=(await t.write('close-qualified-integration',r.app,abi,'closeEngine')).transactionHash;}
  assert.equal((await readHubDelegation(t.base,hub,r.app)).status,2);r.state='closing-qualified';report.hash=r.closeHash;
 }else{
  assert(['closing-qualified','released-qualified'].includes(r.state));if(d.status!==0){assert.equal(d.status,2);assert((await t.base.getBlock()).timestamp>=d.stakeUnlockAt);
   r.releaseHash=(await t.write('release-qualified-integration',hub,parseAbi(['function releaseStake(address,bytes32)']),'releaseStake',[r.app,zeroHash])).transactionHash;}
  assert.equal((await readHubDelegation(t.base,hub,r.app)).status,0);r.state='released-qualified';report.hash=r.releaseHash;
 }
 const after=await readHubDelegation(t.base,hub,r.app);report.stakeUnlockAt=String(after.stakeUnlockAt);report.state=r.state;
 await writeFile(file+'.next',JSON.stringify(r,null,2),{mode:0o600});await rename(file+'.next',file);
 await writeFile(`artifacts/drand/integration-${action}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await t.close();}
