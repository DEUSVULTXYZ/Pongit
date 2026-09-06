// HTTP acknowledgement and chain confirmation are deliberately independent.
// This controller owns only game-input signatures, never wallet permissions.
export type InputContext = {key:string;direction:number;head:bigint;sign:(nonce:bigint,sequence:bigint,direction:number,head:bigint)=>Promise<unknown>};
type Dependencies = {
  reset?:()=>void;state:()=>Promise<any>;post:(body:unknown)=>Promise<any>;wait:(id:string)=>Promise<any>;
  intent?:(nonce:bigint,direction:number,at:number)=>void;pending:(active:boolean)=>void;ack:(ms:number)=>void;confirmed:(job:any,ms:number)=>void;error:(message:string)=>void;
  now?:()=>number;
};
export class InputController {
  private current:InputContext|null=null;private generation=0;private busy=false;
  private nonce:bigint|null=null;private sequence=1n;private sentDirection:number|null=null;
  private jobs=new Set<string>();private retryAt=0;
  constructor(private d:Dependencies){}
  reset(){this.d.reset?.();this.generation++;this.current=null;this.busy=false;this.nonce=null;this.sequence=1n;this.sentDirection=null;this.jobs.clear();this.retryAt=0;this.d.pending(false);}
  update(context:InputContext|null){
    if(!context){if(this.current)this.reset();return;}
    if(this.current && this.current.key!==context.key)this.reset();
    this.current=context;
    if(!this.busy && (this.sentDirection!==context.direction || this.nonce===null) && this.now()>=this.retryAt)void this.flush();
  }
  private now(){return this.d.now?.()??performance.now();}
  private async flush(){
    if(!this.current)return;this.busy=true;const generation=this.generation;this.d.pending(true);
    try{
      if(this.nonce===null){const c=await this.d.state();if(generation!==this.generation)return;this.nonce=BigInt(c.nextNonce);this.sequence=BigInt(c.nextSequence);}
      const context=this.current;if(!context || generation!==this.generation)return;
      const started=this.now(),direction=context.direction,usedNonce=this.nonce!;
      this.d.intent?.(usedNonce,direction,started);
      const body=await context.sign(this.nonce!,this.sequence++,direction,context.head);
      if(generation!==this.generation)return;
      const result=await this.d.post(body);
      if(generation!==this.generation)return;
      this.d.ack(Math.round(this.now()-started));
      this.nonce=BigInt(result.nextNonce);this.sequence=BigInt(result.nextSequence)>this.sequence?BigInt(result.nextSequence):this.sequence;
      if(!result.accepted){this.sentDirection=null;return;}
      this.sentDirection=direction;
      if(result.status==="failed" || result.status==="superseded"){this.nonce=null;this.sentDirection=null;return;}
      this.jobs.add(result.id);
      // Do not await this promise in the sending loop: releases and reversals
      // can be accepted while the previous transaction waits for its receipt.
      void this.d.wait(result.id).then(job=>{
        if(generation!==this.generation)return;
        this.jobs.delete(result.id);
        if(job.status==="succeeded"){if(this.nonce!==null && this.nonce<=usedNonce)this.nonce=usedNonce+1n;this.d.confirmed(job,Math.round(this.now()-started));}
        this.d.pending(this.jobs.size>0 || this.sentDirection!==this.current?.direction);
      }).catch(error=>{
        if(generation!==this.generation)return;
        this.jobs.delete(result.id);this.nonce=null;this.sentDirection=null;this.retryAt=this.now()+250;
        this.d.error(error.message);this.d.pending(this.jobs.size>0);
      });
    }catch(error){if(generation===this.generation){this.nonce=null;this.sentDirection=null;this.retryAt=this.now()+750;this.d.error((error as Error).message);}}
    finally{if(generation===this.generation){this.busy=false;this.d.pending(this.jobs.size>0 || this.sentDirection!==this.current?.direction);}}
  }
}
