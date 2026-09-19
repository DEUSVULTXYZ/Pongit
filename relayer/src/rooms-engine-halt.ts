import {ENGINE_HALTED_CODE,ENGINE_HALTED_MESSAGE,haltRefusal,refusalReason,type EngineHealth} from '../../shared/engine-halt';
import {EnginePublicationUnavailable} from '../../shared/service-error';

export const ENGINE_RENEWING_MESSAGE='The arcade is recovering its game delegation. Payments continue in the background.';
/** The maintenance loop's verdict on whether commands may be sent; online and
 * admission follow it. Later causes win the player-facing code: the hub check,
 * then a failed publication, then a halted node (the precise cause of that
 * failure), then a lifecycle renewal in progress. */
export function roomsWriteVerdict(o:{unavailable?:{code:string;message:string};publicationBlocked:boolean;halted:boolean;lifecycleStage?:string}){
 let verdict={writable:true,code:'',message:''};
 if(o.unavailable)verdict={writable:false,code:o.unavailable.code,message:o.unavailable.message};
 if(o.publicationBlocked)verdict={writable:false,code:'ENGINE_PUBLICATION_UNAVAILABLE',message:new EnginePublicationUnavailable().message};
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
