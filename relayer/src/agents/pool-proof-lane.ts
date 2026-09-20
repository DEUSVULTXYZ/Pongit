import type {Hex} from 'viem';

type ProofActor={
 busy():boolean;
 read():Promise<{id:bigint;phase:number;revision:bigint;chaos?:{request:bigint;pending:bigint}|null}>;
 send(operation:string,action:'submitRandomness',args:readonly unknown[]):Promise<unknown>;
};

/** Fetching drand does not stop ticks. Once the proof arrives, let the current
 * command finish and give this proof the next turn on the SAME nonce owner. */
export class PoolProofLane {
 private ready=false;
 constructor(private now=Date.now,private wait=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms))){}
 blocksTick(){return this.ready;}
 async submit(actor:ProofActor,id:bigint,request:bigint,proof:Hex){
  if(this.ready)throw Error('A proof already owns the next arena command');
  this.ready=true;
  try{
   const until=this.now()+10_000;
   while(actor.busy()){
    if(this.now()>=until)throw Object.assign(Error('Waiting for the current arena command before the proof'),{code:'POOL_PROOF_WAIT'});
    await this.wait(25);
   }
   const state=await actor.read();
   // The preceding tick can end the match or consume/change this request.
   // Never enqueue a signed command for an obsolete proof.
   if(state.id!==id||state.phase!==2||state.chaos?.request!==request||state.chaos.pending)return;
   await actor.send(`proof:${request}:${state.revision}`,'submitRandomness',[id,request,proof]);
  }finally{this.ready=false;}
 }
}
