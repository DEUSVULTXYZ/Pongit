/** Every arena of the reusable pool is offline: nothing new can be admitted.
 * Legacy single-arena deployments keep their own availability rules. */
export function arenaOutage(pooled:boolean,health:readonly {online:boolean}[]){
 return pooled&&health.length>0&&!health.some(h=>h.online);
}

/** Retry details that describe the wait itself rather than its cause. */
export function quietRetry(detail:string){
 return /^Hosted engine retry is cooling down$/.test(detail);
}
