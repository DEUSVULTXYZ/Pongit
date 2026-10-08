import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createPublicClient,http,type Address} from 'viem';
import {reusableAgentPoolAbi as abi} from '../shared/abi-ReusableAgentPool';
const c=createPublicClient({transport:http('https://testnet-rpc.monad.xyz',{retryCount:0,timeout:15000})});
const block=await c.getBlock(),runs=[];
for(const fault of ['f5','disconnect']){
 const path=`artifacts/qualification/catalogue-responsive-r2-motion-${fault}-1/report.json`,bytes=await readFile(path),r=JSON.parse(bytes.toString());
 assert(r.passed&&r.naturalMatch&&r.visibleBrowser&&!r.mockedNetwork&&r.actualMode===1);
 assert.equal(r.existingSessionAssertions,0);assert.equal(r.startupResumes,0);
 assert.equal(r.faults.length,1);assert(r.faults[0].kind.startsWith(fault));
 const ref={chainId:10143n,arena:r.ref.app as Address,epoch:BigInt(r.ref.epoch),id:BigInt(r.ref.id)};
 const result=await c.readContract({address:'0xe01c31f482113367c510a04816ff371676477fa3',abi,functionName:'result',args:[ref],blockNumber:block.number});
 for(const k of ['hash','status','scoreA','scoreB','winner'] as const)assert.equal(String(result[k]).toLowerCase(),String(r.result[k]).toLowerCase());
 assert.equal(result.status,3);
 runs.push({fault,run:r.run,ref:r.ref,canonicalResult:result,evidence:r.faults,passkeyAssertions:r.existingSessionAssertions,
  intentionalResumes:r.liveness.resumes,localP95Ms:r.input.p95Ms,sendP95Ms:r.sendLatency.p95Ms,
  report:path,sha256:createHash('sha256').update(bytes).digest('hex'),video:r.video,observerVideo:r.observerVideo});
}
assert.equal((await c.getBlock({blockNumber:block.number})).hash,block.hash);
const proof={at:new Date().toISOString(),passed:true,releaseComplete:false,web:'5486a5f',engine:'d558334',block:block.number,hash:block.hash,
 scope:'Actual public visible Chrome/Edge. Existing virtual Mera session restored with no new passkey. Natural finishes. Disconnect held score and authoritative time in independent observer before resuming. Intentional recovery pauses are not normal-network samples.',runs};
await writeFile('docs/validation/responsive-motion-faults-20261008.json',JSON.stringify(proof,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({passed:true,block:String(block.number),runs:runs.map(r=>r.ref.id)}));
