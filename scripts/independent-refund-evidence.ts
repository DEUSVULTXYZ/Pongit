// Read-only verification after the isolated fixture service has closed every epoch.
// It never triggers a claim or retries a payment.
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createPublicClient, http, type Address, type Hex} from 'viem';
import {abi as marketAbi} from '../shared/abi-independent-MarketV4';
import {abi as ratingsAbi} from '../shared/abi-independent-PublishedRatings';
const manifest=JSON.parse(await readFile(process.env.PONG_INDEPENDENT_MANIFEST!,'utf8'));
assert.equal(manifest.production,false);
const evidence=JSON.parse(await readFile('artifacts/independent-candidate/lifecycle.json','utf8'));
assert.equal(evidence.lobby.toLowerCase(),manifest.lobby.toLowerCase());
assert(evidence.arenas.every((a:any)=>a.hubStatus===0),'All fixture epochs must be released');
assert(evidence.arenas.every((a:any)=>a.journal.every((j:any)=>['observed','obsolete'].includes(j.status))),'No unresolved command may remain in a released fixture');
const base=createPublicClient({transport:http(process.env.RPC_URL,{retryCount:0,timeout:10000})});
const cancellations=[];
for(const arena of evidence.arenas.filter((a:any)=>a.entry?.latest.status===4)){
 const change=await base.readContract({address:manifest.ratings,abi:ratingsAbi,functionName:'ratingChange',args:[BigInt(arena.id)]});
 assert.equal(change[0],change[2]);assert.equal(change[1],change[3]);
 assert.equal(arena.entry.latest.winner,'0x0000000000000000000000000000000000000000');
 assert.equal(arena.entry.finality,true);
 cancellations.push({id:arena.id,mode:arena.entry.latest.mode,ranked:arena.entry.latest.ranked,ratingChange:change,winner:arena.entry.latest.winner});
}
const proofs=[];
for(const payment of evidence.payments){
 const id=BigInt(payment.id),player=payment.player as Address;
 const position=await base.readContract({address:manifest.market,abi:marketAbi,functionName:'positions',args:[id,player]});
 const payout=await base.readContract({address:manifest.market,abi:marketAbi,functionName:'payouts',args:[payment.payoutId]});
 assert.equal(position[3],true);assert.equal(payout[0].toLowerCase(),player.toLowerCase());
 assert.equal(payout[1],position[2]);assert.equal(payout[2],2);assert.equal(payout[3],1);
 const arena=evidence.arenas.find((a:any)=>a.id===payment.id);
 assert.equal(arena?.entry?.latest.status,4,'Refund must follow cancellation, not a fabricated winner');
 const paid=evidence.operations.flatMap((op:any)=>(op.events??[]).filter((e:any)=>e.event==='PayoutPaid'&&e.args.payoutId===payment.payoutId).map((e:any)=>({hash:op.hash,event:e})));
 assert.equal(paid.length,1,'Exactly one payment transaction in the operation journal');
 const receipt=await base.getTransactionReceipt({hash:paid[0].hash as Hex});assert.equal(receipt.status,'success');
 const events=receipt.logs.filter(l=>l.address.toLowerCase()===manifest.market.toLowerCase()&&l.topics[1]===payment.payoutId);
 assert(events.length>=1);
 const [before,after]=await Promise.all([base.getBalance({address:player,blockNumber:receipt.blockNumber-1n}),base.getBalance({address:player,blockNumber:receipt.blockNumber})]);
 assert.equal(after-before,payout[1],'Disconnected beneficiary receives the exact amount without gas or a signature');
 async function rejects(name:'claim'|'retryPayout',args:any[],reason:string){
  let rejected=false;
  try{await base.simulateContract({address:manifest.market,abi:marketAbi,functionName:name,args} as any);}
  catch(error){const e=error as any;const reverted=e.walk?.((x:any)=>x.name==='ContractFunctionRevertedError');assert(reverted,'Must observe a contract revert, not an RPC failure');assert(String(reverted.reason??reverted.message).includes(reason));rejected=true;}
  assert(rejected,`${name} must reject a second payment`);
 }
 await rejects('claim',[id,player],'claim');await rejects('retryPayout',[payment.payoutId],'not pending');
 proofs.push({id,player,payoutId:payment.payoutId,amount:payout[1],transaction:receipt.transactionHash,block:receipt.blockNumber,balanceBefore:before,balanceAfter:after,attempts:payout[3],duplicateClaimRejected:true,duplicateRetryRejected:true});
}
assert(proofs.length>0);
const report={at:new Date().toISOString(),scope:'Real testnet cancellation refunds to disconnected browser fixtures; read-only checks, no winning payout claimed',allEpochsReleased:true,unresolvedEngineCommands:0,cancellations,proofs};
await writeFile('artifacts/independent-candidate/refund-proof.json',JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2));
console.log(JSON.stringify({refunds:proofs.length,allEpochsReleased:true,passed:true}));
