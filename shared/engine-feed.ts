import {decodeEventLog} from "viem";
import {engineState,receiptFrame,mergeEngineFrame,type EngineFrame,type EngineState,type EngineStream} from "./engine-stream";
import {readEngineSnapshot} from "./engine-snapshot";
import {recordRpc} from "./rpc-metrics";

type Entry={value?:EngineState;fullAt:number;dirty:boolean;pending?:Promise<EngineState>;progressAt:number;listeners:Set<(s:EngineState)=>void>};
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
  this.unwatch??=this.stream.subscribe(frame=>this.apply(frame),()=>{for(const e of this.entries.values())e.dirty=true;});
  return ()=>{entry.listeners.delete(fn);if(!--this.users){this.unwatch?.();this.unwatch=undefined;}if(!entry.listeners.size)this.entries.delete(id);};
 }
 peek(id:bigint){return this.entries.get(id)?.value;}
 progressAge(id:bigint){return this.now()-this.entry(id).progressAt;}
 invalidate(){for(const e of this.entries.values())e.dirty=true;}
 private publish(entry:Entry,next:EngineState){
  if(!entry.value || next.state.t>entry.value.state.t || next.phase!==entry.value.phase)entry.progressAt=this.now();
  entry.value=next;for(const fn of entry.listeners)fn(next);
 }
 apply(frame:EngineFrame){
  for(const entry of this.entries.values()){
   if(!entry.value)continue;
   const merged=mergeEngineFrame(this.client.abi,this.client.app,entry.value,frame,this.now());
   if(merged.resync){entry.dirty=true;continue;}
   if(merged.changed)this.publish(entry,merged.state);
  }
 }
 async read(id:bigint,force=false):Promise<EngineState>{
  const e=this.entry(id),now=this.now();
  // A consistency read is ten seconds apart while events advance the match.
  // A stale stream is not treated as a fresh clock merely because it is connected.
  if(!force&&!e.dirty&&e.value&&now-e.fullAt<10000&&now-e.value.observedAt<(this.connected?600:500)){recordRpc({at:now,target:"interlude",method:"snapshot.cached",status:200,ms:0,source:"cache"});return e.value;}
  if(e.pending)return e.pending;
  e.pending=readEngineSnapshot(this.client,id).then(async v=>{
   let incoming=engineState(v,this.now());const current=e.value;
   if(incoming.id!==id)throw new Error("Snapshot belongs to another match");
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
   e.fullAt=this.now();e.dirty=false;this.publish(e,incoming);return incoming;
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
  // Only the caller's successful, matching receipt proves this input sequence.
  // The event alone intentionally never guesses the other player's nonce.
  if(frame && e.value && !e.dirty && name==="input" && args[0]===id && e.value.phase===2){
   const nonce=BigInt(args[2] as bigint),side=account.toLowerCase()===e.value.a.toLowerCase()?"nonceA":account.toLowerCase()===e.value.b.toLowerCase()?"nonceB":null;
   if(side)this.publish(e,{...e.value,[side]:e.value[side]>nonce?e.value[side]:nonce});
  }
  if(!frame||e.dirty||!e.value)return this.read(id,true);
  return e.value;
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
