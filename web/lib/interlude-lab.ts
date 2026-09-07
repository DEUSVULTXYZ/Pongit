import {createInterludeClient,webStorageStore,type Session} from "@interludelayer-sdk/sdk";
import {createPublicClient,http,type Address,type Abi} from "viem";
import {monadTestnet} from "viem/chains";
import {readContract} from "viem/actions";
import manifest from "../../deployments/interlude-lab.json";
import {interludeLabAbi,interludeHubReadAbi} from "../../shared/abi-interlude";
import type {State} from "../../shared/physics-v2";

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

/** One SDK nonce owner. Unsent directions coalesce; uncertain writes never retry here. */
export class LabLane {
 desired=0;
 busy=false;
 inputPending=false;
 actionPending=false;
 stopped=false;
 constructor(private read:()=>Promise<LabSnapshot>,private session:LabSession,private account:string,
  private onResult:(s:LabSnapshot,latency?:number)=>void,private onError:(e:unknown)=>void){}
 intent(direction:number){this.desired=direction;}
 stop(){this.stopped=true;this.desired=0;}
 async action(name:string,args:readonly unknown[]=[]){
  if(this.stopped||this.actionPending)throw new Error("Reconnect the lab session or wait for the current action.");
  this.actionPending=true;
  while(this.busy&&!this.stopped)await new Promise(r=>setTimeout(r,20));
  if(this.stopped){this.actionPending=false;throw new Error("Reconnect the lab session before sending another action.");}
  this.busy=true;
  try{const r=await this.session.send(name,args);const s=await this.read();this.onResult(s,r.latencyMs);return s;}
  catch(e){this.stop();this.onError(e);throw e;}
  finally{this.busy=false;this.actionPending=false;}
 }
 async pump(allowTick:boolean){
  if(this.busy||this.stopped||this.actionPending)return;
  this.busy=true;
  try{
   let s=await this.read();const side=labSide(s,this.account);
   this.onResult(s);
   if(this.stopped||side<0||s.phase!==2)return;
   // Drain a release/reversal immediately after its predecessor, without
   // waiting for the 100 ms idle-tick interval. Never resend an uncertain call.
   for(let n=0;n<4 && !this.stopped && !this.actionPending && s.phase===2;n++){
    const changed=(side===0?s.state.leftDir:s.state.rightDir)!==this.desired;
    if(!changed && (!allowTick||n>0))break;
    this.inputPending=changed;
    const result=changed
     ?await this.session.send("input",[s.id,this.desired,(side===0?s.nonceA:s.nonceB)+1n,s.head+150n])
     :await this.session.send("tick",[s.id]);
    s=await this.read();this.inputPending=false;this.onResult(s,result.latencyMs);
   }
  }catch(e){this.stop();this.onError(e);}
  finally{this.inputPending=false;this.busy=false;}
 }
}
