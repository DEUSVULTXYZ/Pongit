import {ENGINE_GAS_CAP_CODE,ENGINE_GAS_CAP_MESSAGE,ENGINE_HALTED_CODE,ENGINE_HALTED_MESSAGE,gasCapRefusal,haltRefusal,refusalReason,type EngineHealth} from '../../shared/engine-halt';
import {EnginePublicationUnavailable} from '../../shared/service-error';

export const ENGINE_RENEWING_MESSAGE='The arcade is recovering its game delegation. Payments continue in the background.';
/** The maintenance loop's verdict on whether commands may be sent; online and
 * admission follow it. Later causes win the player-facing code: the hub check,
 * then a failed publication, then a node that refuses the configured command gas,
 * then a halted node (the precise cause of a publication failure, and it refuses
 * every command whatever its gas), then a lifecycle renewal in progress. */
export function roomsWriteVerdict(o:{unavailable?:{code:string;message:string};publicationBlocked:boolean;gasCapped?:boolean;halted:boolean;lifecycleStage?:string}){
 let verdict={writable:true,code:'',message:''};
 if(o.unavailable)verdict={writable:false,code:o.unavailable.code,message:o.unavailable.message};
 if(o.publicationBlocked)verdict={writable:false,code:'ENGINE_PUBLICATION_UNAVAILABLE',message:new EnginePublicationUnavailable().message};
 if(o.gasCapped)verdict={writable:false,code:ENGINE_GAS_CAP_CODE,message:ENGINE_GAS_CAP_MESSAGE};
 if(o.halted)verdict={writable:false,code:ENGINE_HALTED_CODE,message:ENGINE_HALTED_MESSAGE};
 if(o.lifecycleStage!==undefined&&!['playing','draining'].includes(o.lifecycleStage))verdict={writable:false,code:'ENGINE_RENEWING',message:ENGINE_RENEWING_MESSAGE};
 return verdict;
}

export type EngineHaltState={reason:string;source:'health'|'send';epoch:number;since:number}|null;
export type EngineHaltChange='halted'|'recovered'|undefined;

/** The relayer's view of a halted game node (see shared/engine-halt.ts).
 *
 * - A /health report is authoritative both ways: `halted` marks the node halted,
 *   an explicit not-halted clears it.
 * - A failed or unreadable /health read changes nothing. It never marks a node
 *   halted by itself, and never clears a halt either.
 * - A send refused with "this session is over ... no longer accepting
 *   transactions" marks the node halted at once, before the next health read.
 * - A new engine epoch is a new node session: an earlier epoch's halt is dropped
 *   and the new session's health decides again.
 */
export class EngineHaltMonitor {
 private current:EngineHaltState=null;
 constructor(private now=Date.now){}
 get state(){return this.current;}
 observe(health:EngineHealth|undefined,epoch:number):EngineHaltChange{
  let change:EngineHaltChange;
  if(this.current&&this.current.epoch!==epoch){this.current=null;change='recovered';}
  if(!health)return change;
  if(health.halted){
   const was=this.current;
   this.current={reason:health.halted,source:'health',epoch,since:was?.since??this.now()};
   return was?undefined:'halted';
  }
  if(this.current){this.current=null;return 'recovered';}
  return change;
 }
 refused(error:unknown,epoch:number):EngineHaltChange{
  if(!haltRefusal(error))return undefined;
  if(this.current&&this.current.epoch===epoch)return undefined;
  this.current={reason:refusalReason(error)||'refused: session over',source:'send',epoch,since:this.now()};
  return 'halted';
 }
}

export type EngineGasCapState={gas:string;epoch:number;since:number;reason:string}|null;
/** The node refused a command because its gas limit is above the node's cap.
 * Every later command signed with the same limit would be refused too, so the
 * relayer treats the node as unavailable (ENGINE_GAS_CAP) instead of retiring one
 * command after another while players see a live arena. It holds for the epoch in
 * which it was seen, at the limit that was refused: a new epoch's node, or a
 * relayer restarted with a lower ROOMS_ENGINE_COMMAND_GAS, decides again. */
export class EngineGasCapMonitor {
 private current:EngineGasCapState=null;
 constructor(private now=Date.now){}
 get state(){return this.current;}
 /** True when this refusal newly marks the node. */
 refused(error:unknown,epoch:number,gas:bigint):boolean{
  if(!gasCapRefusal(error))return false;
  if(this.current&&this.current.epoch===epoch&&this.current.gas===String(gas))return false;
  this.current={gas:String(gas),epoch,since:this.now(),reason:refusalReason(error)||'gas limit is greater than the cap'};
  return true;
 }
 /** The maintenance loop's session epoch. True when a new epoch cleared the mark. */
 observe(epoch:number):boolean{
  if(!this.current||this.current.epoch===epoch)return false;
  this.current=null;return true;
 }
}
