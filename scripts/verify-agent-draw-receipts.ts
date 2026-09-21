// Read-only receipt evidence for an already published match. Input is an
// allowlisted export of operation/hash/epoch/status, never signed transactions.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createPublicClient,http,decodeEventLog,decodeAbiParameters,type Address,type Hex} from 'viem';
import {reusableAgentArenaAbi as abi} from '../shared/abi-ReusableAgentArena';
import {reusableAgentPoolAbi as poolAbi} from '../shared/abi-ReusableAgentPool';
const [appText,epochText,idText,url,poolText,input,out]=process.argv.slice(2);
assert(/^0x[\da-f]{40}$/i.test(appText)&&/^0x[\da-f]{40}$/i.test(poolText)&&/^\d+$/.test(epochText)&&/^\d+$/.test(idText));
const app=appText as Address,epoch=BigInt(epochText),id=BigInt(idText),pool=poolText as Address;
assert.equal(new URL(url).protocol,'https:');assert.equal(new URL(url).hostname,`il-${app.slice(2,18).toLowerCase()}.fly.dev`);
const jobs=JSON.parse(await readFile(input,'utf8'));
assert(Array.isArray(jobs)&&jobs.length>0&&jobs.length<=64&&process.env.RPC_URL);
const base=createPublicClient({transport:http(process.env.RPC_URL,{retryCount:0,timeout:15000})});
const node=createPublicClient({transport:http(url,{retryCount:0,timeout:10000})});
const report:any={at:new Date().toISOString(),app,pool,epoch:epochText,id:idText,passed:false,draws:[],activeEffects:[],
 scope:'Successful hosted verification receipts and canonical published result. Not a proof of every combination, continuous service or finality.'};
try{
 assert.equal(await base.getChainId(),10143);
 const health=await (await fetch(url+'/health',{signal:AbortSignal.timeout(5000)})).json() as any;
 assert.equal(health.app.toLowerCase(),app.toLowerCase());assert.equal(String(health.epoch),String(epoch));
 const block=await base.getBlock();report.block=String(block.number);report.blockHash=block.hash;
 const ref={chainId:10143n,arena:app,epoch,id};
 const result=await base.readContract({address:pool,abi:poolAbi,functionName:'result',args:[ref],blockNumber:block.number});
 assert.equal(result.status,3);assert.equal(result.mode,1);assert.equal(result.ref.epoch,epoch);assert.equal(result.ref.id,id);
 report.result=result;const effects=new Set<number>(),seen=new Set<string>();
 for(const job of jobs){
  assert.equal(String(job.epoch),String(epoch));assert.equal(job.status,'observed');
  assert(job.operation.startsWith(`match:${id}:proof:`)&&/^0x[\da-f]{64}$/i.test(job.hash)&&!seen.has(job.hash));seen.add(job.hash);
  const receipt=await node.getTransactionReceipt({hash:job.hash as Hex});assert.equal(receipt.status,'success');
  assert.equal(receipt.transactionHash.toLowerCase(),job.hash.toLowerCase());assert.equal(receipt.to?.toLowerCase(),app.toLowerCase());
  for(const log of receipt.logs){
   if(log.address.toLowerCase()!==app.toLowerCase())continue;
   let event:any;try{event=decodeEventLog({abi,data:log.data,topics:log.topics});}catch{continue;}
   if(event.args.id!==id)continue;
   if(event.eventName==='RandomnessVerified')report.draws.push({hash:job.hash,index:event.args.index,round:event.args.round,event:Number(event.args.draw&255n)});
   if(event.eventName==='Snapshot'){
    const [version,,words]=decodeAbiParameters([{type:'uint8'},{type:'uint256'},{type:'uint256[8]'}],event.args.state);
    assert.equal(version,6);const ms=(words[6]>>112n&((1n<<64n)-1n))/1000n;
    for(const word of [words[4],words[5]]){
     const effect=Number(word&255n),start=word>>56n&0xffffffffn,end=word>>88n&0xffffffffn;
     if(effect>=1&&effect<=24&&ms>=start&&ms<end)effects.add(effect);
    }
   }
  }
  await new Promise(resolve=>setTimeout(resolve,250));
 }
 report.activeEffects=[...effects].sort((a,b)=>a-b);
 assert(report.draws.some((d:any)=>d.event===23),'Expected verified BOSS ROUND draw missing');
 assert.equal((await base.getBlock({blockNumber:block.number})).hash,block.hash,'Reorganized observation');report.passed=true;
}catch{report.error='Receipt qualification incomplete; preserve this report and do not infer missing event proof.';process.exitCode=1;}
await writeFile(out,JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({passed:report.passed,draws:report.draws.length,bossVerified:report.draws.some((d:any)=>d.event===23),activeEffects:report.activeEffects}));
