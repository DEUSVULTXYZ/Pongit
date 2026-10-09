/** Join only admissions already being validated. A durable queue item never
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
   const remaining=Math.min(1000,createdAt+1000-Date.now());
   if(!pending.size||!Number.isFinite(remaining)||remaining<=0)return;
   // Snapshot once: later requests cannot extend this item's deadline.
   const peers=[...pending];let timer:ReturnType<typeof setTimeout>|undefined;
   try{await Promise.race([Promise.allSettled(peers),new Promise<void>(resolve=>{timer=setTimeout(resolve,remaining);})]);}
   finally{if(timer)clearTimeout(timer);}
  },
 };
}
