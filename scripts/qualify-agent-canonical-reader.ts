// Read-only, same-block compatibility and fresh-view latency measurements.
// Never mount a signing key or journal database for this observer.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createPublicClient,http,type Address} from 'viem';
import {monadTestnet} from 'viem/chains';
import {AgentPoolReader} from '../relayer/src/agents/pool-read';

const [out,blockText]=process.argv.slice(2);
assert(out?.startsWith('/evidence/')&&/^\d+$/.test(blockText));
const manifest=JSON.parse(await readFile('/metadata/manifest.json','utf8'));
const traffic:Record<string,number>={};
const base=createPublicClient({chain:monadTestnet,batch:{multicall:{wait:15,batchSize:8192}},transport:http('http://rpc:8545',{
 retryCount:0,timeout:10000,fetchFn:async(url,options)=>{const body=JSON.parse(String(options?.body));
  assert(!/send|sign/i.test(body.method),'Observer cannot write');traffic[body.method]=(traffic[body.method]??0)+1;return fetch(url,options);},
})});
assert.equal(await base.getChainId(),10143);
const block=await base.getBlock({blockNumber:BigInt(blockText)});assert(block.hash);
// Force both reader generations to the same identified block. The old reader's
// trailing canonical check still reaches the real node.
const pinned={...base,getBlock:(args:any={})=>base.getBlock({...args,blockNumber:args.blockNumber??block.number})};
const reader=new AgentPoolReader(pinned as typeof base,manifest);
const ref={chainId:10143 as const,app:'0xf202862714F61D6f6b8b14C1D2F5d3cA7EA3E41b' as Address,epoch:'4',id:'284'};
const methods={config:()=>reader.config(),catalog:()=>reader.catalog(),match:()=>reader.match(ref),
 tournament:()=>reader.tournament(12n),classic:()=>reader.rankings(0),chaos:()=>reader.rankings(1)};
const report:any={at:new Date().toISOString(),block:String(block.number),blockHash:block.hash,passed:false,views:{},samples:[]};
try{
 for(const [name,read] of Object.entries(methods)){
  const view=await read();assert.equal(view.observedHash,block.hash);
  const body=JSON.stringify(view.value,(key,value)=>key==='observedAt'?undefined:typeof value==='bigint'?String(value):value);
  report.views[name]=createHash('sha256').update(body).digest('hex');
 }
 const live=new AgentPoolReader(base,manifest);
 for(let i=0;i<3;i++)for(const [name,read] of [['config',()=>live.config()],['match',()=>live.match(ref)]] as const){
  const start=performance.now();await read();report.samples.push({name,ms:performance.now()-start});
 }
 assert.equal((await base.getBlock({blockNumber:block.number})).hash,block.hash);
 report.passed=true;
}catch(error){report.error=String((error as Error).message).split('\n')[0].slice(0,200);process.exitCode=1;}
report.traffic=traffic;report.finishedAt=new Date().toISOString();await writeFile(out,JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
