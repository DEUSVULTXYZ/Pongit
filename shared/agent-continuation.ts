import {parseAbi,type Address,type Abi} from 'viem';

export const agentContinuationAbi=parseAbi([
 'function predecessor() view returns (address)',
 'function inheritedCount() view returns (uint64)',
 'function continuationSealed() view returns (bool)',
 'function sourceRevision() view returns (uint256)',
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
export async function ratingContinuationWork(read:Read,ratings:Address,predecessor:Address,ratingsAbi:Abi,scanFinality=false){
 const [actual,source,observed,cursor]=await Promise.all([
  read(ratings,agentContinuationAbi,'predecessor'),
  read(predecessor,ratingsAbi,'revision'),
  read(ratings,agentContinuationAbi,'sourceRevision'),
  read(ratings,agentContinuationAbi,'synchronizationCursor'),
 ]);
 if(String(actual).toLowerCase()!==predecessor.toLowerCase())throw Error('Ratings predecessor mismatch');
 // Finality can advance without changing source.revision. Periodic bounded
 // scans therefore remain necessary after apparent correction convergence.
 return scanFinality||source!==observed||cursor!==0n?{to:ratings,method:'synchronizeHistory',args:[32]}:null;
}
