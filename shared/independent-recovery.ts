import {publicationUnavailable} from './service-error';

/** A readable snapshot does not prove that the node can still publish writes. */
export class ArenaRecovery {
 private blocked=false;
 private message='';
 failure(error:unknown){
  this.blocked ||= publicationUnavailable(error);
  this.message=this.blocked?'This arena is waiting for publication recovery. Your arcade session is still saved.':
   (error as Error)?.message==='Renew arcade session'?'Renew arcade session':'Synchronizing this arena. Your arcade session is still saved.';
  return this.message;
 }
 observed(terminal=false,confirmedWrite=false){
  if(terminal||confirmedWrite){this.blocked=false;this.message='';}
  else if(!this.blocked)this.message='';
  return this.message;
 }
}

export function sameChaosPause(live:{scoreA:number;scoreB:number;resumeAt:bigint;awaitingServe:boolean},published:typeof live){
 return live.awaitingServe&&published.awaitingServe&&live.scoreA===published.scoreA&&live.scoreB===published.scoreB&&live.resumeAt===published.resumeAt;
}

/** Repeated permissionless calls must identify the state they intend to advance. */
export function maintenanceContext(kind:'round'|'room',state:unknown){
 return kind+':'+JSON.stringify(state,(_,v)=>typeof v==='bigint'?String(v):v);
}
