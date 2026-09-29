export type ArenaOperationalState={app:string;epoch:string;id?:string;stage:string;observedAt:number};
export type AgentCapacity={observedAt:number;known:boolean;serviceUnavailable?:boolean;freeChallengeLanes:number;readyArenas:number;admissions:boolean};
export type AgentAvailability='available'|'capacity-occupied'|'service-unavailable'|'agent-busy'|'qualifying'|'incompatible';
export function freshArenaState(row:ArenaOperationalState|undefined,epoch:bigint,now:number){
 return !!row&&row.epoch===String(epoch)&&Number.isFinite(row.observedAt)&&now>=row.observedAt&&now-row.observedAt<=15000;
}
export function agentAvailability(capacity:AgentCapacity,bot:{modeSupported:boolean;qualified:boolean;available:boolean;exclusiveBusy:boolean}):AgentAvailability{
 if(!bot.modeSupported)return'incompatible';
 if(!bot.qualified)return'qualifying';
 if(!bot.available||!capacity.known||!capacity.admissions||capacity.serviceUnavailable)return'service-unavailable';
 if(bot.exclusiveBusy)return'agent-busy';
 if(!capacity.freeChallengeLanes||!capacity.readyArenas)return'capacity-occupied';
 return'available';
}
