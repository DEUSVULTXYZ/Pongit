import type {Address,Hex,PublicClient} from 'viem';
import {estimateFeesPerGas} from 'viem/actions';

/** The caller holds the one operator lock and has reconciled its journal.
 * Independent chain reads share a round trip instead of serializing the
 * whole acceptance window. Nothing is signed until all checks succeed.
 */
export async function prepareSponsoredTransaction(base:PublicClient,account:Address,tx:{to:Address;data:Hex;value:bigint},
 strictEstimate?:{to:Address;data:Hex;value:bigint}|readonly {to:Address;data:Hex;value:bigint}[]|null){
 // The public viem fee action also reads the latest block. Share this one
 // in-flight observation, only within this preparation; never cache it across
 // transactions or replace viem's chain-specific fee calculation.
 const blockRead=base.getBlock();
 const feeClient={...base,getBlock:()=>blockRead};
 const gasRead=(async()=>{
  const candidates=Array.isArray(strictEstimate)?strictEstimate:strictEstimate?[strictEstimate]:[];
  if(candidates.length>4)throw Error('Too many admission estimate variants');
  // At most four independently simulated prefixes share the round trip. Keep
  // the original preference order: a faster short prefix cannot win a race,
  // and a transport failure cannot be mistaken for a contract refusal.
  const results=await Promise.allSettled(candidates.map(candidate=>base.estimateGas({account,...candidate})));
  for(const result of results){if(result.status==='fulfilled')return result.value;else{const error=result.reason;
   let cause:any=error,reverted=false;for(let i=0;cause&&i<10;i++,cause=cause.cause)
    if(['ExecutionRevertedError','ContractFunctionRevertedError'].includes(cause.name)){reverted=true;break;}
   if(!reverted)throw error;
   // Capacity may have filled. The original optional call still queues the
   // signed request; no replacement action or nonce is created.
  }}
  return base.estimateGas({account,...tx});
 })();
 const [nonce,latest,block,gas,fees]=await Promise.all([
  base.getTransactionCount({address:account,blockTag:'pending'}),
  base.getTransactionCount({address:account,blockTag:'latest'}),
  blockRead,gasRead,estimateFeesPerGas(feeClient),
 ]);
 if(nonce!==latest)throw Error('Existing operator transaction needs reconciliation');
 const limit=gas*12n/10n;
 if(limit>30_000_000n||limit>block.gasLimit)throw Error('Sponsor gas estimate exceeds the chain limit; no transaction signed');
 if(fees.maxFeePerGas===undefined||fees.maxPriorityFeePerGas===undefined||fees.maxFeePerGas<fees.maxPriorityFeePerGas)throw Error('Sponsor fee estimate unavailable; no transaction signed');
 return {...tx,chainId:10143,nonce,gas:limit,type:'eip1559' as const,maxFeePerGas:fees.maxFeePerGas,maxPriorityFeePerGas:fees.maxPriorityFeePerGas};
}
