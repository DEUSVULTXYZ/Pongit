import {createInterludeClient,webStorageStore,type Session} from "@interludelayer-sdk/sdk";
import {createPublicClient,http,type Address,type Abi} from "viem";
import {monadTestnet} from "viem/chains";
import {readContract} from "viem/actions";
import manifest from "../../deployments/interlude-lab.json";
import {interludeLabAbi,interludeHubReadAbi} from "../../shared/abi-interlude";
import type {State} from "../../shared/physics-v2";
import {engineReadRetryMs} from "../../shared/engine-read";

export const labManifest=manifest;
export const labScope=["createMatch","acceptMatch","cancelMatch","input","tick","concede","expire"] as const;
export const labAccountKey=`pongit:interlude:${manifest.app}:account`;
export type LabSession=Session<Abi>;
export type LabSnapshot={id:bigint;revision:bigint;phase:number;a:Address;b:Address;target:Address;winner:Address;head:bigint;clock:bigint;nonceA:bigint;nonceB:bigint;deadline:bigint;state:State;observedAt:number};
export function labSnapshot(value:readonly unknown[]):LabSnapshot {
 const [id,revision,phase,a,b,target,winner,head,clock,nonceA,nonceB,deadline,state]=value;
 return {id:id as bigint,revision:revision as bigint,phase:Number(phase),a:a as Address,b:b as Address,target:target as Address,winner:winner as Address,head:head as bigint,clock:clock as bigint,nonceA:nonceA as bigint,nonceB:nonceB as bigint,deadline:deadline as bigint,state:state as State,observedAt:Date.now()};
}
export function labSide(s:LabSnapshot|null,account?:string){return !s||!account?-1:s.a.toLowerCase()===account.toLowerCase()?0:s.b.toLowerCase()===account.toLowerCase()?1:-1;}
export function createLabClient(){
 const base=createPublicClient({chain:monadTestnet,transport:http("https://testnet-rpc.monad.xyz",{retryCount:0,timeout:8000})});
 return createInterludeClient({app:manifest.app as Address,abi:interludeLabAbi as Abi,node:manifest.node,base,
  transport:http(manifest.node,{retryCount:0,timeout:4000}),store:webStorageStore(sessionStorage),expirySeconds:1800,fastPath:true});
}
export type LabClient=ReturnType<typeof createLabClient>;
export function labDelegation(client:LabClient){return readContract(client.base,{address:manifest.hub as Address,abi:interludeHubReadAbi,functionName:"sessionOf",args:[manifest.app as Address,`0x${"0".repeat(64)}`]});}

class StateReadUnavailable extends Error {
 constructor(cause:unknown){super("Waiting for the game state. Your arcade session is still connected.",{cause});}
}
// These are confirmed EVM reverts, not transport failures. Reading again is
// safe; the next intention uses the newly observed contract nonce.
function recoverableGameRevert(error: unknown) {
 const e=error as {errorName?:string;name?:string};
 return e?.name === "AppRevertError" && ["InvalidMatch","StaleInput","CatchUpRequired"].includes(e.errorName || "");
}
/** One SDK nonce owner. Unsent directions coalesce; uncertain writes never retry here. */
export class LabLane {
 desired=0;
 busy=false;
 inputPending=false;
 actionPending=false;
 stopped=false;
 private readFailures=0;
 private nextReadAt=0;
 private observationPending=false;
 private expectedInput?:{id:bigint;side:number;nonce:bigint};
 private expectedTerminal?:bigint;
 private latest?:LabSnapshot;
 private lastObservation=0;
 private lastWrite=0;
 constructor(private read:(fresh?:boolean)=>Promise<LabSnapshot>,private session:LabSession,private account:string,
  private onResult:(s:LabSnapshot,latency?:number)=>void,private onError:(e:unknown)=>void,
  private onUnavailable:(e:unknown)=>void=()=>{},
  private pacing:{readMs:number;tickMs:number;now?:()=>number}={readMs:0,tickMs:0}){}
 private now(){return (this.pacing.now || Date.now)();}
 intent(direction:number){this.desired=direction;}
 stop(){this.stopped=true;this.desired=0;}
 private async observe(fresh=false){
  try{
   const s=await this.read(fresh),expected=this.expectedInput;
   if(expected && (s.id!==expected.id || s.phase<3 && (expected.side===0?s.nonceA:s.nonceB)<expected.nonce))
    throw new Error("The read has not caught up with the accepted input.");
   if(this.expectedTerminal!==undefined && (s.id!==this.expectedTerminal || s.phase<3))
    throw new Error("The read has not caught up with the accepted result.");
   this.readFailures=0;this.nextReadAt=0;this.observationPending=false;this.expectedInput=undefined;this.expectedTerminal=undefined;
   this.latest=s;this.lastObservation=this.now();
   return s;
  }catch(e){
   this.nextReadAt=this.now()+Math.max(engineReadRetryMs(e),Math.min(2000,250*2**Math.min(this.readFailures++,3)));
   this.desired=0;
   this.onUnavailable(e);
   throw new StateReadUnavailable(e);
  }
 }
 async action(name:string,args:readonly unknown[]=[]){
  if(this.stopped||this.actionPending)throw new Error("Reconnect the lab session or wait for the current action.");
  if(this.observationPending || this.now()<this.nextReadAt)throw new StateReadUnavailable(undefined);
  this.actionPending=true;
  while(this.busy&&!this.stopped)await new Promise(r=>setTimeout(r,20));
  if(this.stopped){this.actionPending=false;throw new Error("Reconnect the lab session before sending another action.");}
  if(this.observationPending || this.now()<this.nextReadAt){this.actionPending=false;throw new StateReadUnavailable(undefined);}
  this.busy=true;
  try{const r=await this.session.send(name,args);this.observationPending=true;
   if((name==="concede"||name==="cancelMatch") && typeof args[0]==="bigint")this.expectedTerminal=args[0];
   const s=await this.observe(true);this.onResult(s,r.latencyMs);return s;}
  catch(e){if(!(e instanceof StateReadUnavailable)){this.stop();this.onError(e);}throw e;}
  finally{this.busy=false;this.actionPending=false;}
 }
 async pump(allowTick:boolean){
  if(this.busy||this.stopped||this.actionPending||this.now()<this.nextReadAt)return;
  const cached=this.latest, cachedSide=labSide(cached || null,this.account);
  const recent=cached && this.now()-this.lastObservation<this.pacing.readMs && !this.observationPending;
  const newIntent=cached && cachedSide>=0 && (cachedSide===0?cached.state.leftDir:cached.state.rightDir)!==this.desired;
  // Keyboard changes bypass the idle observer cadence. Idle polling does not.
  if(recent && !newIntent && (!allowTick || this.now()-this.lastWrite<this.pacing.tickMs))return;
  this.busy=true;
  let activeMatch:bigint|undefined;
  try{
   let s=recent?cached!:await this.observe();const side=labSide(s,this.account);
   activeMatch=s.id;
   this.onResult(s);
   if(this.stopped||side<0||s.phase!==2)return;
   // Drain a release/reversal immediately after its predecessor, without
   // waiting for the 100 ms idle-tick interval. Never resend an uncertain call.
   for(let n=0;n<4 && !this.stopped && !this.actionPending && s.phase===2;n++){
    const changed=(side===0?s.state.leftDir:s.state.rightDir)!==this.desired;
    if(!changed && (!allowTick||n>0||this.now()-this.lastWrite<this.pacing.tickMs))break;
    this.inputPending=changed;
    const result=changed
     ?await this.session.send("input",[s.id,this.desired,(side===0?s.nonceA:s.nonceB)+1n,s.head+150n])
     :await this.session.send("tick",[s.id]);
    this.lastWrite=this.now();
    this.observationPending=true;
    if(changed)this.expectedInput={id:s.id,side,nonce:(side===0?s.nonceA:s.nonceB)+1n};
    s=await this.observe(true);this.inputPending=false;this.onResult(s,result.latencyMs);
   }
  }catch(e){
   // A read failure never discards a valid grant or retries an accepted write.
   // The next pump only observes first, with backoff and a neutral input.
   if(e instanceof StateReadUnavailable)return;
   if(recoverableGameRevert(e)){
    this.latest=undefined;this.desired=0;this.nextReadAt=this.now()+250;
    this.onUnavailable(e);return;
   }
   // The other player may finish the match while this final input/tick is
   // in flight. Confirm that terminal state instead of breaking the session.
   if(!engineReadRetryMs(e))try{const latest=await this.read(true);if(activeMatch===latest.id && latest.phase>=3){this.desired=0;this.onResult(latest);return;}}catch{}
   this.stop();this.onError(e);
  }
  finally{this.inputPending=false;this.busy=false;}
 }
}
