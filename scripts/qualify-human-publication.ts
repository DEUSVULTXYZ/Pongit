// Read-only hosted publication accounting. No signed payload or storage value is saved.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createPublicClient,http,getAbiItem,decodeFunctionData} from 'viem';
import {publicIndependentManifest} from '../shared/independent';
import {abi as hubAbi} from '../shared/abi-independent-IInterludeHub';
assert.equal(process.env.PONG_HUMAN_PUBLICATION_TEST,'read-only-private');
const raw=JSON.parse(await readFile(process.env.PONG_INDEPENDENT_MANIFEST!,'utf8'));assert.equal(raw.production,false);assert.equal(raw.rulesVersion,14);
const m=publicIndependentManifest(raw),label=process.env.PONG_PUBLICATION_LABEL!;assert(/^[a-z0-9-]{1,32}$/.test(label));
const file=`artifacts/independent-candidate/publication-${label}.json`;
await mkdir('artifacts/independent-candidate',{recursive:true});
const report:any={at:new Date().toISOString(),lobby:m.lobby,passed:false,transactions:[],scope:'Canonical hosted human publications in a bounded window; not a worst-case or continuous-service claim'};
await writeFile(file,JSON.stringify(report),{flag:'wx'});
let tail=Promise.resolve(),next=0;
const paced:typeof fetch=(...args)=>{const job=tail.then(async()=>{await new Promise(r=>setTimeout(r,Math.max(0,next-Date.now())));next=Date.now()+400;return fetch(...args);});tail=job.then(()=>{},()=>{});return job;};
const base=createPublicClient({transport:http(process.env.RPC_URL,{fetchFn:paced,retryCount:0,timeout:15000})});
const flush=()=>writeFile(file,JSON.stringify(report,null,2));
try{
 assert.equal(await base.getChainId(),10143);
 const end=await base.getBlock(),from=BigInt(process.env.PONG_PUBLICATION_FROM!);
 assert(from>=BigInt(m.startBlock!)&&from<=end.number&&end.number-from<=9000n,'Bounded migration publication window');
 report.from=String(from);report.to=String(end.number);report.endHash=end.hash;
 const logs=[];
 for(let at=from;at<=end.number;at+=99n)logs.push(...await base.getLogs({address:m.hub,event:getAbiItem({abi:hubAbi,name:'Committed'}),args:{app:m.arenas.map(a=>a.app)},fromBlock:at,toBlock:at+98n>end.number?end.number:at+98n}));
 const hashes=[...new Set(logs.map(l=>l.transactionHash))];assert(hashes.length>0&&hashes.length<=4000);
 for(const hash of hashes){
  const receipt=await base.getTransactionReceipt({hash}),tx=await base.getTransaction({hash});
  assert.equal(receipt.status,'success');assert.equal(tx.to?.toLowerCase(),m.hub.toLowerCase());assert.equal(tx.blockHash,receipt.blockHash);
  const decoded=decodeFunctionData({abi:hubAbi,data:tx.input});assert.equal(decoded.functionName,'commit');
  const [batch,diffs,entries,raws]=decoded.args as any;
  assert(m.arenas.some(a=>a.app.toLowerCase()===batch.app.toLowerCase()));
  assert.equal(entries.length,raws.length);assert(diffs.length<=64);
  const commitLogs=logs.filter(l=>l.transactionHash===hash);assert(commitLogs.length===1&&commitLogs[0].blockHash===receipt.blockHash);
  report.transactions.push({hash,app:batch.app,batch:String(batch.batchIndex),block:String(receipt.blockNumber),blockHash:receipt.blockHash,
   calldataBytes:(tx.input.length-2)/2,changedWords:diffs.length,commands:entries.length,rawBytes:raws.reduce((sum:number,r:string)=>sum+(r.length-2)/2,0),
   maxRawBytes:Math.max(0,...raws.map((r:string)=>(r.length-2)/2)),gasLimit:String(tx.gas),gasUsed:String(receipt.gasUsed),chargedWei:String(tx.gas*receipt.effectiveGasPrice)});
  await flush();
 }
 assert.equal((await base.getBlock({blockNumber:end.number})).hash,end.hash);
 report.totals={commits:report.transactions.length,chargedWei:report.transactions.reduce((sum:bigint,t:any)=>sum+BigInt(t.chargedWei),0n).toString(),
  maxCalldataBytes:Math.max(...report.transactions.map((t:any)=>t.calldataBytes)),maxChangedWords:Math.max(...report.transactions.map((t:any)=>t.changedWords)),maxCommands:Math.max(...report.transactions.map((t:any)=>t.commands)),maxRawBytes:Math.max(...report.transactions.map((t:any)=>t.maxRawBytes))};report.passed=true;
}catch(e){report.error=String((e as any).shortMessage??(e as Error).message).split('\n')[0].replace(/0x[\da-f]{90,}/gi,'[omitted]').slice(0,300);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await flush();console.log(JSON.stringify({file,passed:report.passed,totals:report.totals,error:report.error}));}
