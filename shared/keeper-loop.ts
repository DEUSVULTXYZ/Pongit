/** A persistent keeper runs one bounded step at a time. Stopping never races a
 * second writer against a transaction whose outcome is still being reconciled. */
export async function keeperLoop(options:{step:()=>Promise<void>;signal:AbortSignal;sleep?:(ms:number,signal:AbortSignal)=>Promise<void>;
 onFailure?:(error:unknown,retryMs:number)=>void;onRecovery?:()=>void;intervalMs?:number}){
 const sleep=options.sleep??((ms,signal)=>new Promise<void>(resolve=>{
  const done=()=>{clearTimeout(timer);signal.removeEventListener('abort',done);resolve();};
  const timer=setTimeout(done,ms);signal.addEventListener('abort',done,{once:true});if(signal.aborted)done();
 }));
 let failures=0;
 while(!options.signal.aborted){
  let retry=options.intervalMs??500;
  try{await options.step();if(failures)options.onRecovery?.();failures=0;}
  catch(error){failures=Math.min(failures+1,5);retry=Math.min(30000,1000*2**failures);options.onFailure?.(error,retry);}
  if(!options.signal.aborted)await sleep(retry,options.signal);
 }
}
