type ExecutedReceipt={hash?:string;block?:string;confirmedAt?:number;status?:string};

/** Distinct successful receipts expose the node's execution clock, independently
 * of cached health or browser prediction. Durations are observed lower bounds:
 * silence between receipts is not evidence that the node clock stopped. */
export function receiptClockMetrics(receipts:ExecutedReceipt[]){
 const seen=new Set<string>();
 const rows=receipts.filter(r=>{
  if(!r.hash||!r.block||!/^0x[\da-f]+$/i.test(r.block)||!Number.isFinite(r.confirmedAt)
   ||!['0x1','success'].includes(String(r.status)))return false;
  return true;
 }).sort((a,b)=>a.confirmedAt!-b.confirmedAt!).filter(r=>{
  const hash=r.hash!.toLowerCase();if(seen.has(hash))return false;seen.add(hash);return true;
 });
 type Run={block:string;firstAt:number;lastAt:number;receipts:number;firstHash:string;lastHash:string};
 const stalls:(Run&{observedMs:number})[]=[],rewinds:{at:number;from:string;to:string;hash:string}[]=[];
 let run:Run|undefined,maxSameBlockMs=0,previous:ExecutedReceipt|undefined;
 const finish=()=>{if(!run)return;const observedMs=run.lastAt-run.firstAt;
  maxSameBlockMs=Math.max(maxSameBlockMs,observedMs);if(observedMs>500)stalls.push({...run,observedMs});};
 for(const row of rows){
  if(previous&&BigInt(row.block!)<BigInt(previous.block!))rewinds.push({at:row.confirmedAt!,from:previous.block!,to:row.block!,hash:row.hash!});
  if(run&&BigInt(row.block!)===BigInt(run.block)){run.lastAt=row.confirmedAt!;run.lastHash=row.hash!;run.receipts++;}
  else{finish();run={block:row.block!,firstAt:row.confirmedAt!,lastAt:row.confirmedAt!,receipts:1,firstHash:row.hash!,lastHash:row.hash!};}
  previous=row;
 }
 finish();return{samples:rows.length,maxSameBlockMs,stalls,rewinds};
}
