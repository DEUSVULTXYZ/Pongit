/** Join overlapping admission validations. A durable queue item never
 * waits more than one second, and neither a signer lock nor a nonce is held. */
export function sponsorIntakeWindow(){
 const pending=new Set<Promise<unknown>>();
 return {
  get size(){return pending.size;},
  track<T>(run:()=>Promise<T>):Promise<T>{
   const work=Promise.resolve().then(run);pending.add(work);
   void work.finally(()=>pending.delete(work)).catch(()=>{});return work;
  },
  async join(createdAt:number){
   const deadline=Math.min(Date.now()+1000,createdAt+1000);
   // A peer can begin validating while the first snapshot is in flight. Join
   // that overlapping work too, but never wait for a future arrival once empty
   // and never reset the oldest durable item's deadline.
   while(pending.size){
    const remaining=deadline-Date.now();
    if(!Number.isFinite(remaining)||remaining<=0)return;
    const peers=[...pending];let timer:ReturnType<typeof setTimeout>|undefined;
    try{await Promise.race([Promise.allSettled(peers),new Promise<void>(resolve=>{timer=setTimeout(resolve,remaining);})]);}
    finally{if(timer)clearTimeout(timer);}
   }
  },
 };
}
