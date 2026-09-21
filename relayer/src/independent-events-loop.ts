import type {Hex} from 'viem';
import type {EngineState} from '../../shared/engine-stream';
import {ChaosBeaconPump} from '../../shared/chaos-beacon-pump';
import {PoolProofLane} from './agents/pool-proof-lane';

type Actor={
 reference():{id:bigint;epoch:bigint};busy():boolean;read():Promise<EngineState>;
 send(action:'start'|'tick'|'submitRandomness'|'cancelUnready',args:readonly unknown[]):Promise<unknown>;
 node:{getBlock():Promise<{timestamp:bigint}>};
 launchAt(id:bigint):Promise<bigint>;progressAge(id:bigint):number;
 launchClock?(id:bigint):Promise<readonly [bigint,bigint]>;
 readiness?(id:bigint):Promise<readonly [number,bigint]>;
 epochCommands?:boolean;
};
/** A proof uses the existing arena writer. Fetch latency never stops ticks;
 * only a ready proof reserves its next turn, after rechecking the full binding. */
export function independentEventsLoop(actor:Actor,beacon=new ChaosBeaconPump(),lane=new PoolProofLane()){
 let stopped=false,proof:Promise<void>|undefined;
 const same=(ref:{id:bigint;epoch:bigint})=>{const now=actor.reference();return !stopped&&now.id===ref.id&&now.epoch===ref.epoch;};
 const send=(ref:{id:bigint;epoch:bigint},action:Parameters<Actor['send']>[0],args:readonly unknown[])=>{
  if(!same(ref))throw Error('Arena binding changed before command');
  return actor.send(action,actor.epochCommands?(action==='start'?[ref.epoch,ref.id]:[ref.epoch,...args]):args);
 };
 const idle={playing:false,request:0n,pending:0n};
 const request=(s:EngineState)=>({playing:s.phase===2,request:s.chaos?.request??0n,pending:s.chaos?.pending??0n});
 async function supply(onError:(error:unknown)=>void){
  if(stopped||proof)return;
  const ref=actor.reference();if(!ref.id||!ref.epoch)return;
  const state=await actor.read();if(!same(ref)||state.id!==ref.id||!state.chaos)return;
  proof=beacon.offer(`${ref.epoch}:${ref.id}`,request(state),async()=>{
   if(!same(ref))return idle;
   const fresh=await actor.read();return same(ref)&&fresh.id===ref.id?request(fresh):idle;
  },async(expected,signature:Hex)=>{
   if(!same(ref))return;
   await lane.submit({busy:actor.busy,read:async()=>{
    if(!same(ref))throw Error('Randomness belongs to a retired arena binding');
    const fresh=await actor.read();if(!same(ref))throw Error('Arena binding changed during proof read');return fresh;
   },send:async(_operation,action,args)=>{
    if(!same(ref))throw Error('Arena binding changed before proof submission');
    return send(ref,action,args);
   }},ref.id,expected,signature);
  }).catch(onError).finally(()=>{proof=undefined;});
 }
 async function progress(){
  if(stopped||actor.busy()||lane.blocksTick())return;
  const ref=actor.reference();if(!ref.id||!ref.epoch)return;
  const state=await actor.read();if(!same(ref)||state.id!==ref.id)return;
  if(state.phase===1){
   const [launch,block]=await Promise.all([actor.launchAt(ref.id),actor.node.getBlock()]);
   if(actor.readiness){
    const [mask,deadline]=await actor.readiness(ref.id);
    if(!same(ref)||actor.busy())return;
    if(mask!==3){
     if(!deadline)await send(ref,'start',[]);
     else if(block.timestamp>deadline)await send(ref,'cancelUnready',[ref.id]);
     return;
    }
   }
   // The first start arms the deadline. Further calls cannot shorten/extend it.
   if(launch&&actor.launchClock){
    const [deadline,clock]=await actor.launchClock(ref.id);
    if(!deadline||clock<deadline)return;
   }
   if(same(ref)&&!actor.busy()&&(!launch||block.timestamp>=launch))await send(ref,'start',[]);
  }else if(state.phase===2&&actor.progressAge(ref.id)>=1500&&!lane.blocksTick()&&!actor.busy())await send(ref,'tick',[ref.id]);
 }
 return {progress,supply,blocksWrite:()=>lane.blocksTick(),stop:()=>{stopped=true;}};
}
