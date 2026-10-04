import {decodeAbiParameters, decodeEventLog, type Abi, type Address, type Hex} from "viem";
import type {State} from "./physics-v2";
import {recordRpc} from "./rpc-metrics";
import {validateSynchronization,type AgentSynchronization} from './agent-synchronization';
import {unpackChaos,chaosLegacy,unpackChaosCollision,snapshotHeaderFields,type ChaosDecoded} from './chaos-codec';

export type EngineFrame = {app:Address;hash:Hex;head:bigint;logs:readonly {address:Address;topics:readonly Hex[];data:Hex}[]};
export type EngineState = {id:bigint;revision:bigint;phase:number;a:Address;b:Address;target:Address;winner:Address;head:bigint;clock:bigint;nonceA:bigint;nonceB:bigint;deadline:bigint;state:State;chaos?:ChaosDecoded;sync?:AgentSynchronization;observedAt:number;reset?:boolean};
export function engineState(v:readonly unknown[],now=Date.now()):EngineState {
 const [id,revision,phase,a,b,target,winner,head,clock,nonceA,nonceB,deadline,state]=v;
 return {id:id as bigint,revision:revision as bigint,phase:Number(phase),a:a as Address,b:b as Address,target:target as Address,winner:winner as Address,head:head as bigint,clock:clock as bigint,nonceA:nonceA as bigint,nonceB:nonceB as bigint,deadline:deadline as bigint,state:state as State,...(v[13]?{chaos:v[13] as ChaosDecoded}:{}),...(v[14]?{sync:v[14] as AgentSynchronization}:{}),observedAt:now};
}
export const engineTuple=(s:EngineState)=>[s.id,s.revision,BigInt(s.phase),s.a,s.b,s.target,s.winner,s.head,s.clock,s.nonceA,s.nonceB,s.deadline,s.state,...(s.sync?[s.chaos,s.sync]:s.chaos?[s.chaos]:[])] as const;
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

/** Preserve only known metadata. Ordinary gaps and clock reanchors need a full
 * read; the owning receipt may opt into the complete friendly Classic checkpoint. */
export function mergeEngineFrame(abi:Abi,app:Address,previous:EngineState,frame:EngineFrame,now=Date.now(),allowClassicCheckpoint=false):{state:EngineState;resync:boolean;changed:boolean;gap?:bigint;launch?:boolean} {
 let snapshot:any,completed:any,synchronization:any,request:bigint|undefined,pending:bigint|undefined;
 const collisions:ReturnType<typeof unpackChaosCollision>[]=[];
 for(const log of frame.logs){if(log.address.toLowerCase()!==app.toLowerCase())continue;try{
  const e=decodeEventLog({abi,data:log.data,topics:[...log.topics] as any});const args=e.args as any;
  if(args.id!==previous.id)continue;
  if(e.eventName==="Snapshot")snapshot=args;
  if(e.eventName==="Completed")completed=args;
  if(e.eventName==='Synchronization')synchronization=args;
  if(e.eventName==='EventRequested'){request=args.request;pending=0n;}
  if(e.eventName==='RandomnessVerified')pending=args.draw;
  if(e.eventName==='ChaosCollision')collisions.push(unpackChaosCollision(args.collision));
 }catch{}}
 if(!snapshot || snapshot.version<=previous.revision)return {state:previous,resync:false,changed:false};
 // A friendly Classic command receipt carries the complete physics, exact
 // clock, bot brain and queued intent. A few intervening engine ticks require
 // no second RPC. Chaos can miss draw metadata and still needs a full read.
 // Only the owning receipt path opts in; disconnect/reset recovery stays strict.
 const checkpoint=allowClassicCheckpoint&&!previous.chaos&&previous.phase===2&&Number(snapshot.status)===2
  &&snapshot.version-previous.revision<=8n&&!!previous.sync?.pause.human
  &&synchronization?.version===snapshot.version&&synchronization.pause.human===previous.sync.pause.human
  &&synchronization.controllers===previous.sync.controllers;
 if((snapshot.version!==previous.revision+1n&&!checkpoint) || frame.head<previous.head || previous.phase<2){
  recordRpc({at:now,target:'interlude',method:frame.head<previous.head?'snapshot.reanchor':previous.phase<2?'snapshot.admission':'snapshot.gap',status:200,ms:0,source:'cache'});
  return {state:previous,resync:true,changed:false,...(frame.head>=previous.head&&previous.phase>=2&&snapshot.version>previous.revision+1n?{gap:snapshot.version}:{} ),
   ...(previous.phase===1&&Number(snapshot.status)===2&&frame.head>=previous.head?{launch:true}:{})};
 }
 try{
  let state:State,chaos=previous.chaos,nonceA=previous.nonceA,nonceB=previous.nonceB;
  if(chaos){
   const [version,control,words]=decodeAbiParameters([{type:'uint8'},{type:'uint256'},{type:'uint256[8]'}],snapshot.state);
   // The packed-state format (ChaosCodec), 6 under rules 6, 7 and 8 alike; not RULES_VERSION.
   if(version!==6)throw Error('Unknown Chaos snapshot');
   const physics=unpackChaos(words,previous.state.seed,control);state=chaosLegacy(physics,Number(snapshot.status)>=3);
   chaos={physics,request:request??chaos.request,pending:pending??chaos.pending,collisions};
   nonceA=BigInt.asUintN(64,control>>16n);nonceB=BigInt.asUintN(64,control>>80n);
  }else state=decodeAbiParameters([snapshotHeaderFields(abi)[12]],snapshot.state)[0] as State;
  const phase=Number(snapshot.status);
  if(phase>=3&&!completed)return {state:previous,resync:true,changed:false};
  let winner=completed?.winner??previous.winner;
  if(phase>=3&&completed?.result){
   const r=completed.result.match_,ref=r?.ref??r;
   if(!r||ref.id!==previous.id||ref.arena?.toLowerCase()!==app.toLowerCase()
    ||r.a.toLowerCase()!==previous.a.toLowerCase()||r.b.toLowerCase()!==previous.b.toLowerCase()
    ||Number(r.status)!==phase||r.scoreA!==state.scoreA||r.scoreB!==state.scoreB
    ||![previous.a.toLowerCase(),previous.b.toLowerCase(),'0x0000000000000000000000000000000000000000'].includes(r.winner.toLowerCase()))
     return {state:previous,resync:true,changed:false};
   winner=r.winner;
  }
  if(previous.sync&&(!synchronization||synchronization.version!==snapshot.version))return {state:previous,resync:true,changed:false};
  const sync:AgentSynchronization|undefined=synchronization?validateSynchronization({pause:synchronization.pause,brainA:synchronization.brainA,brainB:synchronization.brainB,decision:synchronization.decision,pendingControls:synchronization.pendingControls,controllers:synchronization.controllers}):previous.sync;
  const elapsed=previous.clock+(frame.head-previous.head)*10000n;
  let clock=synchronization?.clock??(phase===2?(elapsed>state.t?elapsed:state.t):state.t);
  if(sync?.pause.human&&clock>sync.pause.limitUs)clock=sync.pause.limitUs;
  return {state:{...previous,reset:false,revision:snapshot.version,phase,head:frame.head,clock,state,...(chaos?{chaos}:{}),...(sync?{sync}:{}),nonceA,nonceB,winner,observedAt:now},resync:false,changed:true};
 }catch{return {state:previous,resync:true,changed:false};}
}

/** Reconnection delay after `failures` consecutive failures: 250 ms, doubling to 2 s. */
export const streamRetryMs=(failures:number)=>Math.min(2000,250*2**Math.min(Math.max(failures,0),3));
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
 // Like the Interlude SDK: 250 ms doubling to a 2 s cap, so a blip never leaves a
 // player on polling for long. An explicit server cooldown (delay) still wins.
 private schedule(){if(!this.stopped)this.retry=setTimeout(()=>this.open(),Math.max(this.delay(),streamRetryMs(this.failures++))+Math.floor(Math.random()*200));}
 stop(){this.stopped=true;clearTimeout(this.retry);clearTimeout(this.handshake);const socket=this.socket;this.socket=undefined;socket?.close();this.setConnected(false);}
}
