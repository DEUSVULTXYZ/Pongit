import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createPublicClient,http,type Address} from 'viem';
import {reusableAgentPoolAbi as abi} from '../shared/abi-ReusableAgentPool';
import {sustainedInputMetrics} from './browser-sync-probe';
import {collisionIntegrity} from './collision-integrity-metrics';
const names=['motion-chaos360-2','motion-chaos390-2','motion-chaos1440-2','motion-chaosedge360-2','motion-chaoschrome390-2','motion-classic1366-2','motion-classic360-2'];
const client=createPublicClient({transport:http('https://testnet-rpc.monad.xyz',{retryCount:0,timeout:15000})});
const block=await client.getBlock(),runs=[];
for(const name of names){
 const path=`artifacts/qualification/catalogue-responsive-r2-${name}/report.json`,bytes=await readFile(path),r=JSON.parse(bytes.toString());
 assert(r.passed&&r.naturalMatch&&r.normalNetworkQualification&&r.visibleBrowser&&!r.mockedNetwork);
 assert.equal(r.rulesVersion,17);assert.equal(r.pool.toLowerCase(),'0xe01c31f482113367c510a04816ff371676477fa3');
 const cutover=JSON.parse(await readFile('artifacts/responsive-20261008-r2/motion-web-cutover-10.json','utf8'));assert(cutover.passed);assert(Date.parse(r.startedAt)>Date.parse(cutover.started));
 assert.equal(r.startupResumes,0);assert.equal(r.liveness.resumes,0);assert.equal(r.sync.contractPauseMs,0);
 assert(Object.values(r.naturalGates).every(v=>v===true));assert.equal(r.collisions.unconfirmed.length,0);
 const trace=JSON.parse(await readFile(path.replace('/report.json','/sync-trace.json'),'utf8'));
 const sustained=sustainedInputMetrics(trace),collisions=collisionIntegrity(trace.poses,trace.snapshots);
 assert.equal(sustained.held.outsideTarget,0);assert(sustained.stopping.p95Drift<=2&&sustained.stopping.maxDrift!<=6);
 assert.equal(collisions.unconfirmed.length,0);
 const ref={chainId:10143n,arena:r.ref.app as Address,epoch:BigInt(r.ref.epoch),id:BigInt(r.ref.id)};
 const canonical=await client.readContract({address:'0xe01c31f482113367c510a04816ff371676477fa3',abi,functionName:'result',args:[ref],blockNumber:block.number});
 for(const k of ['hash','status','scoreA','scoreB','winner'] as const)assert.equal(String(canonical[k]).toLowerCase(),String(r.result[k]).toLowerCase());
 assert.equal(canonical.status,3);
 runs.push({run:r.run,mode:r.actualMode,browser:r.channel,viewport:[r.viewportWidth,r.viewportHeight],touch:r.touchControls,ref:r.ref,
  naturalResult:canonical,admissionMs:r.admissionMs,localP95Ms:r.input.p95Ms,sendP95Ms:r.sendLatency.p95Ms,
  transportP95Ms:r.receiptP95Ms,peerP95Ms:r.peerReception.p95Ms,held:sustained.held,
  stopping:{samples:sustained.stopping.samples,p95:sustained.stopping.p95Drift,max:sustained.stopping.maxDrift},
  metricBasis:'All original traces recalculated with exact painted-time membership and confirmed shield classification; original passing reports remain unchanged.',
  confirmedPaddleContacts:collisions.visiblePaddleBounces,confirmedShields:collisions.shieldBounces.length,
  maxPlayerHoldMs:r.sync.maxHoldMs,maxObserverHoldMs:r.spectatorSync.maxHoldMs,frameP95Ms:r.sync.p95FrameMs,
  contractPauseMs:r.sync.contractPauseMs,resyncs:r.sync.visibleResyncs,passkeyAssertions:r.existingSessionAssertions,
  report:path,sha256:createHash('sha256').update(bytes).digest('hex'),video:r.video,observerVideo:r.observerVideo});
}
assert.equal(runs.filter(r=>r.mode===1).length,5);assert.equal(runs.filter(r=>r.mode===0).length,2);
assert.equal((await client.getBlock({blockNumber:block.number})).hash,block.hash);
const result={at:new Date().toISOString(),passed:true,releaseComplete:false,web:'5486a5faab7366639307bea3652f51095cc0866b',engine:'d55833436dbaff7743bc80c3aa817ba4e0dadf57',
 canonicalBlock:block.number,canonicalHash:block.hash,physicalPhone:false,physicalPasskey:false,
 scope:'Visible Chrome/Edge public catalogue, actual keyboard and CDP touch, virtual Mera PRF. Independent observers and natural published results. Published is not final. Earlier failed reports preserved.',runs,
 remaining:['Current product fault follow-up','Two PvP games: three human hosted nodes stopped','Five agents plus two humans: four healthy agent nodes','Final unchanged all-role 24-hour qualification']};
await writeFile('docs/validation/responsive-motion-normal-20261008.json',JSON.stringify(result,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({passed:true,runs:runs.length,block:String(block.number),maxAdmission:Math.max(...runs.map(r=>r.admissionMs)),maxSendP95:Math.max(...runs.map(r=>r.sendP95Ms))}));
