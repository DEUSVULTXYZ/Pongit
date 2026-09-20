/** Hosted fixtures use the same explicit resynchronization as the UI. A
 * confirmed send is supplied separately and is never retried by this helper. */
export async function fixtureSnapshot<T>(first:()=>Promise<T>,fresh:()=>Promise<T>,record:(reason:string,attempt:number)=>void,wait=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms))):Promise<T>{
 let read=first;
 for(let attempt=0;;attempt++){
  try{return await read();}
  catch(error){
   const reason=error instanceof Error?error.message:'';
   if(attempt>=8||!['Engine snapshot is behind the applied stream','Engine reset is not yet consistent','Engine clock needs reconciliation'].includes(reason))throw error;
   record(reason,attempt+1);await wait(Math.min(500,200+attempt*100));read=fresh;
  }
 }
}
