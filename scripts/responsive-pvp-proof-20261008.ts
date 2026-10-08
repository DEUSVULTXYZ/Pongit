import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createPublicClient,http} from 'viem';
import {publicIndependentManifest} from '../shared/independent';
import {independentReader} from '../shared/independent-read';
const m=publicIndependentManifest((await (await fetch('https://pongit.xyz/api/independent/config')).json()).manifest);
assert.equal(m.rulesVersion,18);assert.equal(m.lobby.toLowerCase(),'0xdf44e1cae317bc9d8bafcf9b292b08bb90996fb7');
const c=createPublicClient({transport:http('https://testnet-rpc.monad.xyz',{retryCount:0,timeout:15000})});
const block=await c.getBlock(),r=independentReader(c,m,block.number),runs=[];
for(const name of ['browser-r2pvpclassic5','browser-chaos-r2pvpchaos1']){
 const path=`artifacts/independent-candidate/${name}/report.json`,bytes=await readFile(path),d=JSON.parse(bytes.toString());
 assert(d.passed&&d.naturalOnly&&d.visibleBrowser&&d.integrity&&Object.values(d.syncGates).every(x=>x===true));
 assert(d.integrityGates.every((g:any)=>Object.values(g).every(x=>x===true)));
 const id=BigInt(d.commandReceipts[0].id),entry=await r.ratings('entry',[id]);
 assert.equal(entry.first.id,id);assert.equal(entry.latest.status,3);assert.equal(Math.max(entry.latest.scoreA,entry.latest.scoreB),7);
 const score=d.checks.find((x:any)=>x.finalScore)?.finalScore;assert.equal(score,`${entry.latest.scoreA} : ${entry.latest.scoreB}`);
 runs.push({path,sha256:createHash('sha256').update(bytes).digest('hex'),startedAt:d.startedAt,finishedAt:d.finishedAt,result:entry.latest,
  sync:d.sync.slice(0,2).map((s:any)=>({localP95Ms:s.localInput.p95Ms,heldMaxMs:s.maxHoldMs,frameP95Ms:s.p95FrameMs,
   snapshotGapP95Ms:s.snapshotGapP95Ms,pausesMs:s.contractPauseMs,resyncs:s.visibleResyncs,jumps:s.snapshotJumps.length})),
  sustained:d.sustained.slice(0,2).map((s:any)=>({heldSamples:s.held.samples,outsideTarget:s.held.outsideTarget,
   releaseP95:s.stopping.p95Drift,releaseMax:s.stopping.maxDrift})),peer:d.peerReception,videos:d.videos});
}
assert.equal((await c.getBlock({blockNumber:block.number})).hash,block.hash);
const payment=JSON.parse(await readFile('artifacts/responsive-20261008-r2/pvp-chaos-payment-1.json','utf8'));assert(payment.passed&&payment.attempts===1);
const result={at:new Date().toISOString(),passed:true,releaseComplete:false,web:'5486a5f',humanRelayer:'c45f25e',
 canonicalBlock:block.number,canonicalHash:block.hash,runs,payment,
 scope:'Two natural actual public Chrome/Edge PvP games with virtual PRF. Chaos beneficiary browser disconnected before automatic payout; duplicate claim/retry simulations revert. Earlier failures remain unchanged. Seven-way and 24-hour gates are separate.'};
await writeFile('docs/validation/responsive-pvp-20261008.json',JSON.stringify(result,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({passed:true,block:String(block.number),runs:runs.length}));
