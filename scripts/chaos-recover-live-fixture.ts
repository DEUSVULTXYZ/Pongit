import {recordRoomsFinanceReceipt} from '../relayer/src/rooms-finance-receipts';
// Resume only our disposable hosted test after a test runner interruption.
import assert from 'node:assert/strict';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createPublicClient,http,encodeFunctionData,keccak256,toHex,type Hex} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {chainTools} from './independent-chain-tools';
import {roomsEventsAbi as abi} from '../shared/abi-PongChaosEvents';
import {realtimeMarketAbi as marketAbi} from '../shared/abi-RealtimeMarket';
import {loadRoomsFinance} from '../relayer/src/rooms-finance-config';
import {createRoomsFinance} from '../relayer/src/rooms-finance';
assert.equal(process.env.PONG_CHAOS_QUALIFY,'isolated-hosted-testnet');
const prefix=process.env.PONG_CHAOS_QUALIFY_ID!;assert(['chaos-events-integration-20260913','chaos-events-production-20260913'].includes(prefix));const production=prefix==='chaos-events-production-20260913';
const run=process.env.PONG_REALTIME_RUN||'1';assert(/^[1-9]$/.test(run));
const file=`/secrets/${prefix}-live-${run}.json`,s=JSON.parse(await readFile(file,'utf8'));
const root=JSON.parse(await readFile(`/secrets/${prefix}.json`,'utf8')),id=BigInt(s.active.id);
assert(id===202609131000n+BigInt(run)*10n+1n,'Only the interrupted Chaos fixture');
const signer=privateKeyToAccount(production?process.env.INTERLUDE_COORDINATOR_KEY as Hex:root.keys[6]),node=createPublicClient({transport:http(root.node,{retryCount:0,timeout:12000})});
const manifests=JSON.parse(await readFile(`artifacts/drand/${production?'production':'integration'}-manifests.json`,'utf8')),finance=manifests.finance;
assert.equal(root.app,finance.app);process.env.ROOMS_FINANCE_MANIFEST='artifacts/drand/test-finance.json';
process.env.ROOMS_PRESSURE_KEY_FILE=production?'/secrets/pressure.json':`/secrets/${prefix}-pressure.json`;
const config=await loadRoomsFinance(),t=await chainTools(prefix+'-live-'+run);
const save=async()=>{await writeFile(file+'.next',JSON.stringify(s,null,2),{mode:0o600});await rename(file+'.next',file);};
const report:any={at:new Date().toISOString(),app:root.app,id:String(id),ticks:[],resolved:[]};
try{
 for(const [tag,encoded] of Object.entries(s.journals||{})){
  const jobs=JSON.parse(encoded as string);for(const job of jobs.filter((j:any)=>j.state==='uncertain')){
   const receipt=await node.getTransactionReceipt({hash:job.hash});assert(receipt,'Do not replace a missing receipt');
   job.state=receipt.status==='success'?'confirmed':'reverted';report.resolved.push({hash:job.hash,status:receipt.status});
  }s.journals[tag]=JSON.stringify(jobs);
 }await save();
 const deadline=Date.now()+120000;
 while(Date.now()<deadline){
  const snap=await node.readContract({address:root.app,abi,functionName:'getSnapshot',args:[id]});if(snap[2]>=3n)break;
  let job=s.recoveryTick;
  if(!job||job.state==='confirmed'){
   const nonce=await node.getTransactionCount({address:signer.address});
   const raw=await signer.signTransaction({chainId:4242,type:'eip1559',to:root.app,nonce,gas:15000000n,maxFeePerGas:0n,maxPriorityFeePerGas:0n,data:encodeFunctionData({abi,functionName:'tick',args:[id]})});
   job=s.recoveryTick={raw,hash:keccak256(raw),nonce,state:'uncertain'};await save();
  }
  const receipt:any=await node.getTransactionReceipt({hash:job.hash}).catch(()=>null)||await node.request({method:'interlude_sendTransaction',params:[job.raw]} as any);
  assert.equal(receipt.transactionHash.toLowerCase(),job.hash);assert(['0x1','success'].includes(receipt.status));
  job.state='confirmed';await save();report.ticks.push(job.hash);await new Promise(r=>setTimeout(r,350));
 }
 const live=await node.readContract({address:root.app,abi,functionName:'getSnapshot',args:[id]});assert.equal(live[2],3n);
 assert.equal(await node.readContract({address:root.app,abi,functionName:'activeCount'}),0n);
 for(const action of ['buy-live-chaos','buy-live-other-side']){const j=(await t.db.query('SELECT hash FROM il_lifecycle_jobs WHERE id=$1',[prefix+'-live-'+run+':'+action])).rows[0];assert(j);await recordRoomsFinanceReceipt(t.db,[finance],await t.base.getTransactionReceipt({hash:j.hash}));}
 const worker=await createRoomsFinance({db:t.db,base:t.base,manifest:finance,enqueue:async(r,_internal,value=0n)=>{
  const e=config.encode(r),name='finance-'+keccak256(toHex(JSON.stringify({to:e.address,data:e.data,value},(_,v)=>typeof v==='bigint'?String(v):v))).slice(2,26);
  const receipt=await t.submit(name,e.data,e.address,value);return{id:name,hash:receipt.transactionHash};
 }});
 const bettor=privateKeyToAccount(s.players[4].key as Hex).address,until=Date.now()+150000;
 while(Date.now()<until){await worker.audit();const position=await t.base.readContract({address:finance.market,abi:marketAbi,functionName:'positions',args:[id,bettor]});if(position[3])break;await new Promise(r=>setTimeout(r,1500));}
 const published=await t.base.readContract({address:root.app,abi,functionName:'getSnapshot',args:[id]});assert.equal(published[2],3n);assert.equal(published[6],live[6]);
 const position=await t.base.readContract({address:finance.market,abi:marketAbi,functionName:'positions',args:[id,bettor]});assert(position[3]);
 const payoutId=await t.base.readContract({address:finance.market,abi:marketAbi,functionName:'payoutId',args:[0,id,bettor]});
 report.payout=await t.base.readContract({address:finance.market,abi:marketAbi,functionName:'payouts',args:[payoutId]});report.wallet=await t.base.getBalance({address:bettor});assert(report.wallet>0n);
 report.score=[live[12].scoreA,live[12].scoreB];report.passed=true;s.active=null;await save();
}finally{await writeFile(`artifacts/drand/events-recovery-${run}.json`,JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2));console.log(JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v));await t.close();}
