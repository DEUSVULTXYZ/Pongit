/** Retry only contention detected before a new operator intent was journaled.
 * The caller must keep the same operation ID and calldata. An uncertain send,
 * nonce mismatch, RPC error or confirmed revert is never retried here.
 */
export async function retryOperatorContention<T>(operation:()=>Promise<T>, options:{
 timeoutMs?:number; now?:()=>number; sleep?:(ms:number)=>Promise<void>;
}={}):Promise<T>{
 const now=options.now??Date.now, sleep=options.sleep??(ms=>new Promise(resolve=>setTimeout(resolve,ms)));
 const deadline=now()+(options.timeoutMs??120_000);
 for(;;){
  try{return await operation();}catch(error){
   const e=error as {code?:string;message?:string};
   const contention=e.code==='ERR_ASSERTION'&&[
    'Reconcile the existing operator transaction first',
    'Operator is busy; retry without creating another operation',
   ].some(message=>e.message===message||e.message?.startsWith(message+'\n'));
   if(!contention||now()>=deadline)throw error;
   await sleep(Math.min(1000,deadline-now()));
  }
 }
}
