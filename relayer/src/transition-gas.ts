/** Reveal may switch from recording a commitment to starting the entire arena after estimation. */
export function transitionGas(functionName:string,estimated:bigint){
 // A coalesced input may change a zero direction to a nonzero direction after
 // simulation: reserve the 20k SSTORE difference plus signature calldata.
 const buffered=estimated*115n/100n+1000n+(functionName==="submitInput"?25000n:0n);
 return functionName==="reveal" && buffered<350_000n?350_000n:buffered;
}
