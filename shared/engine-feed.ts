import {decodeEventLog} from "viem";
import {engineState,receiptFrame,mergeEngineFrame,type EngineFrame,type EngineState,type EngineStream} from "./engine-stream";
import {readEngineSnapshot} from "./engine-snapshot";
import {recordRpc} from "./rpc-metrics";

type Entry={value?:EngineState;fullAt:number;dirty:boolean;gap?:Map<bigint,EngineFrame>;pending?:Promise<EngineState>;progressAt:number;listeners:Set<(s:EngineState)=>void>};
/** Snapshot cache belongs to one deployment. HTTP remains the recovery authority. */
export class EngineFeed {
 private entries=new Map<bigint,Entry>();
 private unwatch?:()=>void;
 private users=0;
 constructor(readonly client:Parameters<typeof readEngineSnapshot>[0],readonly stream:EngineStream,private now=Date.now){}
 get connected(){return this.stream.connected;}
 private entry(id:bigint){let entry=this.entries.get(id);if(!entry){entry={fullAt:0,dirty:true,progressAt:this.now(),listeners:new Set()};this.entries.set(id,entry);}return entry;}
 watch(id:bigint,fn:(s:EngineState)=>void){
  const entry=this.entry(id);entry.listeners.add(fn);this.users++;
  this.unwatch??=this.stream.subscribe(frame=>this.apply(frame),()=>this.invalidate());
  let active=true;
  return ()=>{
   if(!active)return;active=false;entry.listeners.delete(fn);this.users--;
   // React replaces a command lane after nonce recovery. Keep the same arena
   // subscription and snapshot if its replacement subscribes in this commit.
   queueMicrotask(()=>{
    if(!this.users){this.unwatch?.();this.unwatch=undefined;}
    if(!entry.listeners.size&&this.entries.get(id)===entry)this.entries.delete(id);
   });
  };
 }
 peek(id:bigint){return this.entries.get(id)?.value;}
 progressAge(id:bigint){return this.now()-this.entry(id).progressAt;}
 invalidate(){for(const e of this.entries.values()){e.dirty=true;e.gap=undefined;}}
 private publish(entry:Entry,next:EngineState){
  if(!entry.value || next.state.t>entry.value.state.t || next.phase!==entry.value.phase)entry.progressAt=this.now();
  entry.value=next;for(const fn of entry.listeners)fn(next);
 }
 apply(frame:EngineFrame){
  for(const entry of this.entries.values()){
   if(!entry.value)continue;
   const merged=mergeEngineFrame(this.client.abi,this.client.app,entry.value,frame,this.now());
   if(merged.resync){
    // HTTP receipts and the applied stream may arrive in different orders.
    // Only buffer a short forward gap from a previously clean stream. A
    // disconnect, backwards head or invalid payload still requires a full read.
    if(merged.gap!==undefined&&(!entry.dirty||entry.gap)&&merged.gap-entry.value.revision<=8n){
     entry.gap??=new Map();entry.gap.set(merged.gap,frame);
    }else entry.gap=undefined;
    entry.dirty=true;continue;
   }
   if(merged.changed){
    this.publish(entry,merged.state);
    if(entry.gap){
     for(const version of entry.gap.keys())if(version<=entry.value!.revision)entry.gap.delete(version);
     while(entry.gap.has(entry.value!.revision+1n)){
      const version=entry.value!.revision+1n,next=entry.gap.get(version)!;
      entry.gap.delete(version);
      const ordered=mergeEngineFrame(this.client.abi,this.client.app,entry.value!,next,this.now());
      if(ordered.resync||!ordered.changed){entry.gap=undefined;break;}
      this.publish(entry,ordered.state);
     }
     if(entry.gap?.size===0){entry.gap=undefined;entry.dirty=false;recordRpc({at:this.now(),target:'interlude',method:'snapshot.reordered',status:200,ms:0,source:'cache'});}
    }
   }
  }
 }
 async read(id:bigint,force=false):Promise<EngineState>{
  const e=this.entry(id);
  // Give the missing adjacent event one short delivery turn. No guessed state
  // is exposed; a real gap still falls through to the authoritative getter.
  if(!force&&e.gap&&!e.pending)await new Promise(resolve=>setTimeout(resolve,30));
  const now=this.now();
  // A consistency read is ten seconds apart while events advance the match.
  // A stale stream is not treated as a fresh clock merely because it is connected.
  // A paused rally has no physics heartbeat until its checkpoint arrives.
  // Its silence is expected, not evidence of a stale live rally. Keep the
  // ten-second consistency read while subscribed; a disconnect invalidates it.
  const waiting=e.value&&(e.value.phase!==2||e.value.state.awaitingServe);
  const freshness=this.connected?(waiting?10000:600):500;
  if(!force&&!e.dirty&&e.value&&now-e.fullAt<10000&&now-e.value.observedAt<freshness){recordRpc({at:now,target:"interlude",method:"snapshot.cached",status:200,ms:0,source:"cache"});return e.value;}
  if(e.pending)return e.pending;
  const requestedFrom=e.value;
  e.pending=readEngineSnapshot(this.client,id).then(async v=>{
   let incoming=engineState(v,this.now());const current=e.value;
   if(incoming.id!==id)throw new Error("Snapshot belongs to another match");
   // Applied events can overtake an in-flight HTTP read. A contiguous newer
   // frame remains authoritative; this ordinary race is not a node restart.
   // Do not renew the full-read timestamp or permit this after a discontinuity.
   if(!e.dirty&&current&&current!==requestedFrom&&incoming.revision<current.revision){
    recordRpc({at:this.now(),target:'interlude',method:'snapshot.overtaken',status:200,ms:0,source:'cache'});
    return current;
   }
   if(current && incoming.revision<current.revision){
    // A stale HTTP replica must not roll back a newer pushed event. After an
    // actual discontinuity, require two consistent full reads and no intervening
    // push before adopting a reset. The caller then restores the SDK nonce.
    if(!e.dirty){e.dirty=true;throw new Error("Engine snapshot is behind the applied stream");}
    const verify=engineState(await readEngineSnapshot(this.client,id),this.now());
    if(e.value!==current||verify.id!==id||verify.revision!==incoming.revision||verify.state.t!==incoming.state.t||verify.head<incoming.head)throw new Error("Engine reset is not yet consistent");
    incoming={...verify,reset:true};
   }
   if(current && incoming.revision===current.revision && incoming.head<current.head){
    // A node restart may preserve revision and processed time but reset its head.
    if(incoming.state.t!==current.state.t)throw new Error("Engine clock needs reconciliation");
    incoming={...incoming,reset:true};
   }
   e.fullAt=this.now();e.dirty=false;e.gap=undefined;this.publish(e,incoming);return incoming;
  }).finally(()=>{e.pending=undefined;});
  return e.pending;
 }
 async receipt(id:bigint,result:any,name:string,args:readonly unknown[],account:string):Promise<EngineState>{
  const e=this.entry(id),frame=receiptFrame(result.receipt,this.client.app);
  const matches=frame?.logs.some(log=>{if(log.address.toLowerCase()!==this.client.app.toLowerCase())return false;try{
   const decoded=decodeEventLog({abi:this.client.abi,eventName:"Snapshot",data:log.data,topics:[...log.topics] as any});return (decoded.args as any).id===id;
  }catch{return false;}});
  if(!matches)return this.read(id,true);
  if(frame)this.apply(frame);
  if(!frame||e.dirty||!e.value)await this.read(id,!e.gap);
  // Only the caller's successful, matching receipt proves this input sequence.
  // The event alone intentionally never guesses the other player's nonce.
  if(frame && e.value && !e.dirty && name==="input" && args[0]===id && e.value.phase===2){
   const nonce=BigInt(args[2] as bigint),side=account.toLowerCase()===e.value.a.toLowerCase()?"nonceA":account.toLowerCase()===e.value.b.toLowerCase()?"nonceB":null;
   if(side)this.publish(e,{...e.value,[side]:e.value[side]>nonce?e.value[side]:nonce});
  }
  return e.value!;
 }
}

/** The backup takes over after a missed primary heartbeat, not every tick period. */
export class TickPilot {
 private progress=-1n;
 private at=0;
 private lastOwn=0;
 private backup=false;
 private writing=false;
 sending(value:boolean){this.writing=value;}
 observe(s:EngineState,now:number,own=false){
  if(s.state.t===this.progress)return;
  this.progress=s.state.t;this.at=now;
  if(own)this.lastOwn=now;else if(!this.writing && now-this.lastOwn>100)this.backup=false;
 }
 due(side:number,s:EngineState,now:number){
  if(side<0||s.phase!==2||s.state.awaitingServe)return false;
  if(side===0)return now-this.at>=300;
  if(!this.backup&&now-this.at>=900)this.backup=true;
  return this.backup&&now-this.at>=300;
 }
}
