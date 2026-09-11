import {decodeAbiParameters, decodeEventLog, type Abi, type Address, type Hex} from "viem";
import type {State} from "./physics-v2";
import {recordRpc} from "./rpc-metrics";

export type EngineFrame = {app:Address;hash:Hex;head:bigint;logs:readonly {address:Address;topics:readonly Hex[];data:Hex}[]};
export type EngineState = {id:bigint;revision:bigint;phase:number;a:Address;b:Address;target:Address;winner:Address;head:bigint;clock:bigint;nonceA:bigint;nonceB:bigint;deadline:bigint;state:State;observedAt:number;reset?:boolean};
export function engineState(v:readonly unknown[],now=Date.now()):EngineState {
 const [id,revision,phase,a,b,target,winner,head,clock,nonceA,nonceB,deadline,state]=v;
 return {id:id as bigint,revision:revision as bigint,phase:Number(phase),a:a as Address,b:b as Address,target:target as Address,winner:winner as Address,head:head as bigint,clock:clock as bigint,nonceA:nonceA as bigint,nonceB:nonceB as bigint,deadline:deadline as bigint,state:state as State,observedAt:now};
}
export const engineTuple=(s:EngineState)=>[s.id,s.revision,BigInt(s.phase),s.a,s.b,s.target,s.winner,s.head,s.clock,s.nonceA,s.nonceB,s.deadline,s.state] as const;
const hex=(v:unknown,n?:number):v is Hex=>typeof v==="string" && /^0x[\da-f]*$/i.test(v) && v.length%2===0 && (n===undefined||v.length===2+n*2);
export function appliedFrame(value:any,app:Address):EngineFrame|null {
 if(!value || value.succeeded!==true || value.app?.toLowerCase()!==app.toLowerCase() || value.to?.toLowerCase()!==app.toLowerCase() || !hex(value.hash,32) || !Array.isArray(value.logs))return null;
 let head:bigint;try{if(typeof value.blockNumber==="number"&&!Number.isSafeInteger(value.blockNumber))return null;head=BigInt(value.blockNumber);if(head<0n)return null;}catch{return null;}
 const logs=value.logs.filter((l:any)=>hex(l?.address,20)&&hex(l.data)&&Array.isArray(l.topics)&&l.topics.every((t:unknown)=>hex(t,32)));
 return {app,hash:value.hash,head,logs};
}
export function receiptFrame(receipt:any,app:Address):EngineFrame|null {
 if(!["0x1","1","success"].includes(String(receipt?.status)))return null;
 return appliedFrame({...receipt,app,to:app,hash:receipt.transactionHash,succeeded:true},app);
}

/** Events contain physics, not the complete getter. Preserve only known metadata;
 * a missing revision or clock reanchor requires a fresh authoritative read. */
export function mergeEngineFrame(abi:Abi,app:Address,previous:EngineState,frame:EngineFrame,now=Date.now()):{state:EngineState;resync:boolean;changed:boolean} {
 let snapshot:any,completed:any;
 for(const log of frame.logs){if(log.address.toLowerCase()!==app.toLowerCase())continue;try{
  const e=decodeEventLog({abi,data:log.data,topics:[...log.topics] as any});const args=e.args as any;
  if(args.id!==previous.id)continue;
  if(e.eventName==="Snapshot")snapshot=args;
  if(e.eventName==="Completed")completed=args;
 }catch{}}
 if(!snapshot || snapshot.version<=previous.revision)return {state:previous,resync:false,changed:false};
 if(snapshot.version!==previous.revision+1n || frame.head<previous.head || previous.phase<2)
  return {state:previous,resync:true,changed:false};
 const getter=abi.find(x=>x.type==="function"&&x.name==="getSnapshot") as any;
 try{
  const state=decodeAbiParameters([getter.outputs.at(-1)],snapshot.state)[0] as State;
  const phase=Number(snapshot.status);
  if(phase>=3&&!completed)return {state:previous,resync:true,changed:false};
  const elapsed=previous.clock+(frame.head-previous.head)*10000n;
  return {state:{...previous,reset:false,revision:snapshot.version,phase,head:frame.head,clock:phase===2?(elapsed>state.t?elapsed:state.t):state.t,state,winner:completed?.winner??previous.winner,observedAt:now},resync:false,changed:true};
 }catch{return {state:previous,resync:true,changed:false};}
}

export interface StreamSocket {
 readyState:number;send(data:string):void;close():void;
 addEventListener(type:string,listener:(event:any)=>void):void;
}
/** One subscription per client. No RPC is issued for a push notification. */
export class EngineStream {
 connected=false;
 private socket?:StreamSocket;
 private stopped=true;
 private retry?:ReturnType<typeof setTimeout>;
 private handshake?:ReturnType<typeof setTimeout>;
 private failures=0;
 private id=0;
 private listeners=new Set<(frame:EngineFrame)=>void>();
 private states=new Set<(connected:boolean)=>void>();
 constructor(private url:string,private app:Address,private factory:(url:string)=>StreamSocket=(url)=>new WebSocket(url),private delay=()=>0){}
 subscribe(fn:(frame:EngineFrame)=>void,status?:(connected:boolean)=>void){
  this.listeners.add(fn);if(status)this.states.add(status);
  if(this.stopped){this.stopped=false;this.open();}else status?.(this.connected);
  return ()=>{this.listeners.delete(fn);if(status)this.states.delete(status);if(!this.listeners.size)this.stop();};
 }
 private setConnected(value:boolean){if(value===this.connected)return;this.connected=value;recordRpc({at:Date.now(),target:"interlude",method:value?"stream.connected":"stream.disconnected",status:value?200:0,ms:0,source:"websocket"});for(const fn of this.states)fn(value);}
 private open(){
  if(this.stopped)return;
  const wait=this.delay();if(wait>0){this.retry=setTimeout(()=>this.open(),wait);return;}
  const id=++this.id;let subscription:unknown;
  try{
   const socket=this.factory(this.url.replace(/^http/,"ws"));this.socket=socket;
   this.handshake=setTimeout(()=>socket.close(),6000);
   socket.addEventListener("open",()=>{if(this.stopped||socket!==this.socket)return socket.close();socket.send(JSON.stringify({jsonrpc:"2.0",id,method:"interlude_subscribe",params:["applied"]}));});
   socket.addEventListener("message",e=>{if(socket!==this.socket)return;let value:any;try{const raw=String(e.data);if(raw.length>2_000_000)return;value=JSON.parse(raw);}catch{return;}
    if(value.id===id){if(value.error || value.result===undefined){socket.close();return;}subscription=value.result;clearTimeout(this.handshake);this.setConnected(true);return;}
    if(!this.connected||subscription===undefined||value.params?.subscription!==subscription)return;
    const frame=appliedFrame(value.params?.result,this.app);if(frame){this.failures=0;recordRpc({at:Date.now(),target:"interlude",method:"stream.applied",status:200,ms:0,source:"websocket"});for(const fn of this.listeners)fn(frame);}
   });
   socket.addEventListener("error",()=>socket.close());
   socket.addEventListener("close",e=>{if(socket!==this.socket)return;recordRpc({at:Date.now(),target:"interlude",method:`stream.closed.${Number.isInteger(e.code)?e.code:0}`,status:0,ms:0,source:"websocket"});clearTimeout(this.handshake);this.setConnected(false);this.schedule();});
  }catch{this.setConnected(false);this.schedule();}
 }
 private schedule(){if(!this.stopped)this.retry=setTimeout(()=>this.open(),Math.max(this.delay(),Math.min(15000,500*2**Math.min(this.failures++,5)))+Math.floor(Math.random()*200));}
 stop(){this.stopped=true;clearTimeout(this.retry);clearTimeout(this.handshake);const socket=this.socket;this.socket=undefined;socket?.close();this.setConnected(false);}
}
