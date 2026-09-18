import type {Hex} from 'viem';
import {DrandBeaconTransport} from './drand-beacon';

export type BeaconRequestState={playing:boolean;request:bigint;pending:bigint};
/** One in-flight proof per game. This transports the committed round only;
 * contract verification is authoritative. The caller owns the nonce journal. */
export class ChaosBeaconPump {
 private working=new Map<string,Promise<void>>();
 private retry=new Map<string,number>();
 constructor(private beacon:Pick<DrandBeaconTransport,'read'>=new DrandBeaconTransport(),private now=Date.now){}
 /** Whether a proof can be sent now: a round is requested, none is pending, and
  * drand has published that round. The one rule both offer and its callers use. */
 due(state:BeaconRequestState):boolean{
  const round=state.request&((1n<<64n)-1n);
  return state.playing&&round!==0n&&!state.pending&&BigInt(Math.floor(this.now()/1000))>=1727521075n+(round-1n)*3n;
 }
 offer(key:string,state:BeaconRequestState,read:()=>Promise<BeaconRequestState>,send:(request:bigint,proof:Hex)=>Promise<void>):Promise<void>{
  const existing=this.working.get(key);if(existing)return existing;
  const round=state.request&((1n<<64n)-1n);
  if(!this.due(state)||this.now()<(this.retry.get(key)??0))return Promise.resolve();
  const job=this.run(key,state,round,read,send).finally(()=>this.working.delete(key));
  this.working.set(key,job);return job;
 }
 private async run(key:string,state:BeaconRequestState,round:bigint,read:()=>Promise<BeaconRequestState>,send:(request:bigint,proof:Hex)=>Promise<void>){
  try{
   const proof=await this.beacon.read(round),current=await read();
   // A concurrent proof, point ending the match, or renewed epoch must not
   // result in sending an obsolete proof. A race after this read is rejected
   // onchain and handled by the caller's existing receipt reconciliation.
   if(current.playing&&current.request===state.request&&!current.pending)await send(state.request,proof.signature);
   this.retry.delete(key);
  }catch(error){
   this.retry.set(key,Math.max(this.now()+2000,Number((error as {retryAt?:number})?.retryAt)||0));
   while(this.retry.size>128)this.retry.delete(this.retry.keys().next().value!);
   throw error;
  }
 }
}
