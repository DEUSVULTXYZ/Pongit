/** This is a Monad block window, not the three-second legacy match clock. */
export function roomsRoundStatus(rally:number,version:bigint,allowed:boolean,head:bigint){
 const actual=Number(version&255n),closeBlock=version>>8n;
 if(actual!==rally||closeBlock===0n)return {phase:'preparing' as const,blocksLeft:0n};
 if(allowed&&head<closeBlock)return {phase:'open' as const,blocksLeft:closeBlock-head};
 if(head>=closeBlock&&head<closeBlock+2n)return {phase:'closing' as const,blocksLeft:closeBlock+2n-head};
 return {phase:'preparing' as const,blocksLeft:0n};
}
