import {parseAbi,type Address,type Abi} from 'viem';

export const agentContinuationAbi=parseAbi([
 'function predecessor() view returns (address)',
 'function inheritedCount() view returns (uint64)',
 'function continuationSealed() view returns (bool)',
 'function sourceRevision() view returns (uint256)',
 'function sourceCount() view returns (uint256)',
 'function synchronizationCursor() view returns (uint256)',
 'function synchronizeHistory(uint8 budget)',
]);
type Read=(address:Address,abi:Abi,method:string,args?:readonly unknown[])=>Promise<any>;

/** An inherited fixture belongs to its original pool. Never synchronize or
 * re-admit it through the new tournament authority. */
export function localTournamentCursor(count:bigint,inherited:bigint,cursor?:{id:bigint;index:number}){
 if(count<inherited||inherited<0n)throw Error('Invalid tournament continuation');
 if(count===inherited)return null;
 return cursor&&cursor.id>inherited&&cursor.id<=count?cursor:{id:count,index:0};
}

/** Corrections to the source ledger must be imported before new results/ranked
 * admissions. A network error remains an error, never an unchanged verdict. */
export async function ratingContinuationWork(read:Read,ratings:Address,predecessor:Address,ratingsAbi:Abi){
 const [actual,source,observed,cursor]=await Promise.all([
  read(ratings,agentContinuationAbi,'predecessor'),
  read(predecessor,ratingsAbi,'revision'),
  read(ratings,agentContinuationAbi,'sourceRevision'),
  read(ratings,agentContinuationAbi,'synchronizationCursor'),
 ]);
 if(String(actual).toLowerCase()!==predecessor.toLowerCase())throw Error('Ratings predecessor mismatch');
 return source!==observed||cursor!==0n?{to:ratings,method:'synchronizeHistory',args:[32]}:null;
}

/** Finality does not increment revision. Inspect a bounded page at the same
 * pinned block before paying for a full on-chain synchronization. An unchanged
 * ledger must not consume the result writer's gas reserve every minute. The
 * cursor advances only after every read succeeds, and wraps to detect later
 * finality changes. Revision changes and interrupted writes take priority above. */
export async function ratingFinalityPage(read:Read,ratings:Address,predecessor:Address,ratingsAbi:Abi,offset=0n){
 const [inherited,count]=await Promise.all([read(ratings,agentContinuationAbi,'sourceCount'),read(predecessor,ratingsAbi,'count')]);
 if(inherited!==count||count<0n)throw Error('Ratings source history changed after migration');
 if(count===0n)return{changed:false,next:0n};
 const at=offset>=0n&&offset<count?offset:0n;
 const [page,total]=await read(predecessor,ratingsAbi,'resultPage',[at,32n]);
 const length=Number(count-at<32n?count-at:32n);
 if(total!==count||page.length!==length)throw Error('Incomplete ratings finality page');
 const local=await Promise.all(page.map((entry:any)=>read(ratings,ratingsAbi,'entry',[entry.first.id])));
 let changed=false;
 for(let i=0;i<page.length;i++){
  const source=page[i],ours=local[i];
  if(source.first.id!==ours.first.id||String(source.first.arena).toLowerCase()!==String(ours.first.arena).toLowerCase()
   ||source.first.epoch!==ours.first.epoch)throw Error('Ratings finality identity mismatch');
  if(source.finality&&!ours.finality)changed=true;
 }
 const next=at+BigInt(page.length);
 return{changed,next:next>=count?0n:next};
}
