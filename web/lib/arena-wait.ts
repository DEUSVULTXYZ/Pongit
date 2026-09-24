type ArenaState={online:boolean;stage:string};

/** Every arena is offline: nothing can start until one comes back. */
export const arenaOutage=(arenas:readonly ArenaState[]|undefined)=>!!arenas?.length&&!arenas.some(a=>a.online);

/** One honest line for a waiting player, from the arena states the service
 * publishes. Empty when an arena is free and the wait is ordinary. */
export function arenaWaitStatus(arenas:readonly ArenaState[]|undefined){
 if(!arenas?.length)return '';
 if(arenaOutage(arenas))return 'Arenas are restarting. Your spot is kept.';
 if(!arenas.some(a=>a.online&&a.stage==='available'))return 'Every arena is in play. Yours is next.';
 return '';
}

/** Before the engine admits a match, its arena binding is simply not there yet.
 * That is preparation, not a failure: say so quietly and look again soon. */
export const preparingArena=(e:unknown)=>/Arena (participant )?binding changed|Waiting for the assigned arena epoch/.test(String((e as any)?.message??''));

/** m:ss for a waiting timer. */
export const clockLabel=(seconds:number)=>`${Math.floor(Math.max(0,seconds)/60)}:${String(Math.floor(Math.max(0,seconds)%60)).padStart(2,'0')}`;
