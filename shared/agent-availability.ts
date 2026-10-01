export type ArenaOperationalState={app:string;epoch:string;id?:string;stage:string;observedAt:number};
export type AgentCapacity={observedAt:number;known:boolean;serviceUnavailable?:boolean;reason?:'publication'|'recovery'|'closed';freeChallengeLanes:number;readyArenas:number;admissions:boolean};
export function agentServiceUnavailable(capacity:AgentCapacity){return !capacity.known||!capacity.admissions||!!capacity.serviceUnavailable;}
/** Reuse only a recently received advisory view. The sponsor and contract still
 * verify current gates; this observation never reserves or authorizes a seat. */
export function reusableCapacity(capacity:AgentCapacity|undefined,ageMs:number){
 return !!capacity&&Number.isFinite(ageMs)&&ageMs>=0&&ageMs<=2000&&!agentServiceUnavailable(capacity);
}
/** Admission preflight is not a reservation. Full, healthy arenas may queue;
 * an unavailable service must not send a player through authentication first. */
export function canQueueAgent(availability:AgentAvailability|undefined){
 return availability==='available'||availability==='capacity-occupied'||availability==='agent-busy';
}
export type AgentAvailability='available'|'capacity-occupied'|'service-unavailable'|'agent-busy'|'qualifying'|'incompatible';
export function freshArenaState(row:ArenaOperationalState|undefined,epoch:bigint,now:number){
 return !!row&&row.epoch===String(epoch)&&Number.isFinite(row.observedAt)&&now>=row.observedAt&&now-row.observedAt<=15000;
}
export function agentAvailability(capacity:AgentCapacity,bot:{modeSupported:boolean;qualified:boolean;available:boolean;exclusiveBusy:boolean}):AgentAvailability{
 if(!bot.modeSupported)return'incompatible';
 if(!bot.qualified)return'qualifying';
 if(!bot.available||agentServiceUnavailable(capacity))return'service-unavailable';
 if(bot.exclusiveBusy)return'agent-busy';
 if(!capacity.freeChallengeLanes||!capacity.readyArenas)return'capacity-occupied';
 return'available';
}
