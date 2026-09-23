/** A background refresh that fails once is retried silently by its own loop.
 * Only a failure that persists past the grace period is worth showing a player;
 * a success clears it. One instance per polling loop. */
export function quietFailure(graceMs=5000,now=()=>performance.now()){
 let since:number|undefined;
 return{
  failed(message:string){since??=now();return now()-since>=graceMs?message:'';},
  recovered(){since=undefined;},
 };
}
