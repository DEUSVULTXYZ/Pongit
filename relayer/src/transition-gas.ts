/** Reveal may switch from recording a commitment to starting the entire arena after estimation. */
export function transitionGas(functionName:string,estimated:bigint){
 const buffered=estimated*115n/100n+1000n;
 return functionName==="reveal" && buffered<350_000n?350_000n:buffered;
}
