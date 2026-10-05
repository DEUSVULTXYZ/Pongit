import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createPublicClient,http,type Address} from 'viem';
import {monadTestnet} from 'viem/chains';
import {readHubDelegation} from '../shared/rooms-hub';
import {NO_LEASE_HUB} from '../shared/hub-lease';
import {abi as hubAbi} from '../shared/abi-independent-IInterludeHub';
import {reusableAgentPoolAbi} from '../shared/abi-ReusableAgentPool';
import assert from 'node:assert/strict';
const base=createPublicClient({chain:monadTestnet,transport:http('https://testnet-rpc.monad.xyz',{timeout:10000,retryCount:1})});
const block=await base.getBlock(),config=await (await fetch('https://pongit.xyz/api/agents/config')).json(),human=await (await fetch('https://pongit.xyz/api/independent/config')).json();
if(config.hub.toLowerCase()!==NO_LEASE_HUB.toLowerCase()||human.manifest.hub.toLowerCase()!==NO_LEASE_HUB.toLowerCase())throw Error('Unexpected production hub');
const validator=await base.readContract({address:NO_LEASE_HUB,abi:hubAbi,functionName:'defaultValidator',blockNumber:block.number});
const terms=await base.readContract({address:NO_LEASE_HUB,abi:hubAbi,functionName:'termsOf',args:[validator],blockNumber:block.number});
const report:any={validator,terms,at:new Date().toISOString(),block:String(block.number),hub:NO_LEASE_HUB,arenas:[],matches:[]};
for(const a of [...config.arenas,...human.arenas]){const d=await readHubDelegation(base,NO_LEASE_HUB,a.app,block.number);report.arenas.push({app:a.app,epoch:String(d.epoch),status:d.status,expires:String(d.expiresAt),batches:String(d.batchIndex)});}
for(const dir of await readdir('artifacts/qualification')){
 if(!dir.startsWith('catalogue-continuous-'))continue;
 const r=await readFile(`artifacts/qualification/${dir}/report.json`,'utf8').then(JSON.parse).catch(()=>null);if(!r?.ref||!r.result)continue;
 const a=report.arenas.find((x:any)=>x.app.toLowerCase()===r.ref.app.toLowerCase());
 const current=await (await fetch(`https://pongit.xyz/api/agents/matches/${r.ref.app}/${r.ref.epoch}/${r.ref.id}`)).json();
 const canonical=await base.readContract({address:config.pool,abi:reusableAgentPoolAbi,functionName:'result',args:[{chainId:10143n,arena:r.ref.app,epoch:BigInt(r.ref.epoch),id:BigInt(r.ref.id)}],blockNumber:block.number});
 assert.equal(canonical.status,3);assert.equal(canonical.hash.toLowerCase(),r.result.hash.toLowerCase());
 assert.equal(canonical.scoreA,r.result.scoreA);assert.equal(canonical.scoreB,r.result.scoreB);
 assert.equal(canonical.hash.toLowerCase(),current.result?.hash.toLowerCase());
 report.matches.push({run:r.run,...r.ref,originalPassed:r.passed,result:current.result,canonicalHash:canonical.hash,canonicalFinality:canonical.finality,sameActiveEpoch:a?.status===1&&a?.epoch===r.ref.epoch});
}
assert.equal((await base.getBlock({blockNumber:block.number})).hash,block.hash,'Canonical audit block changed');
const out=process.argv[2];if(!out?.startsWith('artifacts/continuous-canonical-'))throw Error('Evidence output only');await writeFile(out,JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2),{flag:'wx'});
console.log(JSON.stringify({out,block:report.block,arenas:report.arenas,matches:report.matches.length,allCapturedWithoutClose:report.matches.every((r:any)=>r.sameActiveEpoch&&r.result)}));
