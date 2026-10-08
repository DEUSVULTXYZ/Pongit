import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createPublicClient,http,type Address} from 'viem';
import {reusableAgentPoolAbi as abi} from '../shared/abi-ReusableAgentPool';
const names=['touchfix360-1','touchfix390-1','touchfixdesktop-1','touchfixedge360-2','touchfixchrome390-2','touchfixclassic1366-1','touchfixclassic360-1'];
const client=createPublicClient({transport:http('https://testnet-rpc.monad.xyz',{retryCount:0,timeout:15000})});
const block=await client.getBlock(),runs=[];
for(const name of names){
 const path=`artifacts/qualification/catalogue-responsive-r2-${name}/report.json`,bytes=await readFile(path),r=JSON.parse(bytes.toString());
 assert(r.passed&&r.naturalMatch&&r.normalNetworkQualification&&r.visibleBrowser&&!r.mockedNetwork);
 assert.equal(r.rulesVersion,17);assert.equal(r.pool.toLowerCase(),'0xe01c31f482113367c510a04816ff371676477fa3');
 assert(Date.parse(r.startedAt)>Date.parse('2026-10-08T09:47:07Z'));
 assert.equal(r.startupResumes,0);assert.equal(r.liveness.resumes,0);assert.equal(r.sync.contractPauseMs,0);
 assert(Object.values(r.naturalGates).every(v=>v===true));assert.equal(r.collisions.unconfirmed.length,0);
 const ref={chainId:10143n,arena:r.ref.app as Address,epoch:BigInt(r.ref.epoch),id:BigInt(r.ref.id)};
 const canonical=await client.readContract({address:'0xe01c31f482113367c510a04816ff371676477fa3',abi,functionName:'result',args:[ref],blockNumber:block.number});
 for(const k of ['hash','status','scoreA','scoreB','winner'] as const)assert.equal(String(canonical[k]).toLowerCase(),String(r.result[k]).toLowerCase());
 assert.equal(canonical.status,3);
 runs.push({run:r.run,mode:r.actualMode,browser:r.channel,viewport:[r.viewportWidth,r.viewportHeight],touch:r.touchControls,ref:r.ref,
  naturalResult:canonical,admissionMs:r.admissionMs,localP95Ms:r.input.p95Ms,sendP95Ms:r.sendLatency.p95Ms,
  transportP95Ms:r.receiptP95Ms,peerP95Ms:r.peerReception.p95Ms,held:r.sustained.held,
  stopping:{samples:r.sustained.stopping.samples,p95:r.sustained.stopping.p95Drift,max:r.sustained.stopping.maxDrift},
  confirmedPaddleContacts:r.collisions.visiblePaddleBounces,confirmedShields:r.collisions.shieldBounces?.length??0,
  maxPlayerHoldMs:r.sync.maxHoldMs,maxObserverHoldMs:r.spectatorSync.maxHoldMs,frameP95Ms:r.sync.p95FrameMs,
  contractPauseMs:r.sync.contractPauseMs,resyncs:r.sync.visibleResyncs,passkeyAssertions:r.existingSessionAssertions,
  report:path,sha256:createHash('sha256').update(bytes).digest('hex'),video:r.video,observerVideo:r.observerVideo});
}
assert.equal(runs.filter(r=>r.mode===1).length,5);assert.equal(runs.filter(r=>r.mode===0).length,2);
assert.equal((await client.getBlock({blockNumber:block.number})).hash,block.hash);
const result={at:new Date().toISOString(),passed:true,releaseComplete:false,web:'c0e687f82d029b0ceb0c1638dec210e3654372fc',engine:'d55833436dbaff7743bc80c3aa817ba4e0dadf57',
 canonicalBlock:block.number,canonicalHash:block.hash,physicalPhone:false,physicalPasskey:false,
 scope:'Visible Chrome/Edge public catalogue, actual keyboard and CDP touch, virtual Mera PRF. Independent observers and natural published results. Published is not final. Earlier failed reports preserved.',runs,
 remaining:['Actual fault/degraded follow-up','Two PvP games: three human hosted nodes stopped','Five agents plus two humans: four healthy agent nodes','Final unchanged all-role 24-hour qualification']};
await writeFile('docs/validation/responsive-touch-normal-20261008.json',JSON.stringify(result,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({passed:true,runs:runs.length,block:String(block.number),maxAdmission:Math.max(...runs.map(r=>r.admissionMs)),maxSendP95:Math.max(...runs.map(r=>r.sendP95Ms))}));
