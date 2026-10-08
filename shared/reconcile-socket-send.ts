import type {Hex} from 'viem';

/** Recover a slow socket using the already journaled transaction's exact hash.
 * A null receipt permits only one resend of those same bytes, never a new nonce
 * or signature. This is the SDK delivery recovery rule with an earlier deadline.
 * A failed lookup or a node rejection never authorizes that resend. */
export async function reconcileSocketSend<T>(o:{hash:Hex;send:()=>Promise<T>;receipt:()=>Promise<unknown>;
 repeat:()=>Promise<T>;slowMs?:number}):Promise<{value:T;recovered?:'receipt'|'repeat'}>{
 type Outcome={ok:true;value:T}|{ok:false;error:unknown};
 let observed:Outcome|undefined,timer:ReturnType<typeof setTimeout>|undefined;
 const outcome=(work:()=>Promise<T>):Promise<Outcome>=>Promise.resolve().then(work).then(
  value=>({ok:true,value}),error=>({ok:false,error}));
 const unwrap=(result:Outcome):T=>{if(!result.ok)throw result.error;return result.value;};
 const primary=outcome(o.send).then(result=>{observed=result;return result;});
 const receipt=(value:unknown):value is T=>{
  const r=value as {transactionHash?:unknown;status?:unknown;blockNumber?:unknown}|null;
  return !!r&&typeof r.transactionHash==='string'&&r.transactionHash.toLowerCase()===o.hash.toLowerCase()
   &&['0x1','0x0','success','reverted'].includes(String(r.status))
   &&typeof r.blockNumber==='string'&&/^0x[\da-f]+$/i.test(r.blockNumber);
 };
 const lookup=()=>o.receipt().then(value=>({kind:'lookup' as const,value}),()=>({kind:'lookup-failed' as const}));
 try{
  const first=await Promise.race([primary.then(value=>({kind:'primary' as const,value})),
   new Promise<{kind:'slow'}>(resolve=>{timer=setTimeout(()=>resolve({kind:'slow'}),o.slowMs??120);})]);
  if(first.kind==='primary')return {value:unwrap(first.value)};
  const found=await Promise.race([primary.then(value=>({kind:'primary' as const,value})),lookup()]);
  if(found.kind==='primary')return {value:unwrap(found.value)};
  if(found.kind==='lookup'&&receipt(found.value))return {value:found.value,recovered:'receipt'};
  // Only an actual null is absence. Malformed, wrong-hash and unavailable reads
  // preserve uncertainty and the original transmission without a retry.
  if(found.kind!=='lookup'||found.value!==null)return {value:unwrap(await primary)};
  if(observed)return {value:unwrap(observed)};
  const repeat=outcome(o.repeat);
  const next=await Promise.race([primary.then(value=>({kind:'primary' as const,value})),
   repeat.then(value=>({kind:'repeat' as const,value}))]);
  if(next.value.ok)return {value:next.value.value,...(next.kind==='repeat'?{recovered:'repeat' as const}:{})};
  // The original may win the race at the node and cause a nonce complaint for
  // the identical copy. Resolve by hash; never free or change that nonce here.
  const final=await Promise.race([next.kind==='primary'?repeat:primary,lookup()]);
  if('ok' in final)return {value:unwrap(final),recovered:'repeat'};
  if(final.kind==='lookup'&&receipt(final.value))return {value:final.value,recovered:'receipt'};
  const other=await(next.kind==='primary'?repeat:primary);
  return {value:unwrap(other),recovered:'repeat'};
 }finally{clearTimeout(timer);}
}
