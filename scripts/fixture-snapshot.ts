import {engineReadRetryMs} from '../shared/engine-read';
/** Hosted fixtures use the same explicit resynchronization as the UI. A
 * confirmed send is supplied separately and is never retried by this helper. */
export async function fixtureSnapshot<T>(first:()=>Promise<T>,fresh:()=>Promise<T>,record:(reason:string,attempt:number)=>void,wait=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms))):Promise<T>{
 let read=first,totalWait=0;
 for(let attempt=0;;attempt++){
  try{return await read();}
  catch(error){
   let reason=error instanceof Error?error.message:'';
   const resync=['Engine snapshot is behind the applied stream','Engine reset is not yet consistent','Engine clock needs reconciliation'].includes(reason);
   const rateWait=engineReadRetryMs(error);
   let timedOut=false;for(let cause:any=error,depth=0;cause&&depth<8;cause=cause.cause,depth++)if(cause.name==='TimeoutError')timedOut=true;
   const delay=rateWait|| (timedOut?1000:Math.min(500,200+attempt*100));
   if(attempt>=8||totalWait+delay>60000||!resync&&!rateWait&&!timedOut)throw error;
   if(!resync)reason=rateWait?'RPC rate limit (read only)':'RPC timeout (read only)';
   record(reason,attempt+1);totalWait+=delay;await wait(delay);read=fresh;
  }
 }
}
