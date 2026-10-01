// Read-only, paired candidate/baseline against one actual canonical block.
// The old reader file is supplied by the isolated qualification container.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createPublicClient,http,type PublicClient} from 'viem';
import {monadTestnet} from 'viem/chains';
import {AgentPoolReader} from '../relayer/src/agents/pool-read';

assert.equal(process.env.PONG_CATALOGUE_READ_PROOF,'paired-private-canonical');
assert.equal(process.getuid?.(),1000);
const beforePath='../relayer/src/agents/pool-read-before.ts';
const {AgentPoolReader:Before}=await import(beforePath);
const manifest=JSON.parse(await readFile('/metadata/manifest.json','utf8'));
assert.equal(manifest.pool.toLowerCase(),'0x550ff3c22e20fc760af9afd68fba2cb531140dc6');
let requests=0;
const fetchFn:typeof fetch=async(...args)=>{requests++;return fetch(...args);};
const base=createPublicClient({chain:monadTestnet,transport:http(process.env.RPC_URL,{fetchFn,timeout:10000,retryCount:0})});
assert.equal(await base.getChainId(),10143);
const block=await base.getBlock();assert(block.hash);
const pinned={...base,getBlock:async()=>block} as unknown as PublicClient;
const readers={baseline:new Before(pinned,manifest),candidate:new AgentPoolReader(pinned,manifest)};
const report:any={startedAt:new Date().toISOString(),block:String(block.number),hash:block.hash,passed:false,samples:[],
 scope:'Real canonical catalogue RPC reads through the shared budget. Operational health and browser admission are separate gates.'};
const file='artifacts/gateway-priority/catalogue-read-pair.json';await writeFile(file,JSON.stringify(report),{flag:'wx'});
try{
 let expected:string|undefined;
 for(const kind of ['baseline','candidate','candidate','baseline','baseline','candidate'] as const){
  requests=0;const began=performance.now();
  const value=await readers[kind].catalog(0n,16);
  const ms=performance.now()-began;
  const digest=createHash('sha256').update(JSON.stringify({items:value.value.items,total:value.value.total,offset:value.value.offset,next:value.value.next})).digest('hex');
  expected??=digest;assert.equal(digest,expected,'Catalogue identities/permissions changed');
  report.samples.push({kind,ms,rpcRequests:requests,identities:value.value.items.length,digest});
 }
 assert.equal((await base.getBlock({blockNumber:block.number})).hash,block.hash);
 report.passed=true;
}catch(error){report.error=String((error as any).shortMessage??(error as Error).message).split('\n')[0].slice(0,240);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await writeFile(file,JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
