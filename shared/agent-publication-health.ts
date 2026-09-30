import {publicationFailureDetails} from './service-error';

/** Allowlisted node evidence only; never persist arbitrary relay responses. */
export function agentPublicationHealth(value: unknown, app: string, epoch: bigint) {
 const h=value as Record<string,unknown>;
 if(!h||typeof h.app!=='string'||h.app.toLowerCase()!==app.toLowerCase()||String(h.epoch)!==String(epoch)
  ||typeof h.ok!=='boolean'||!Number.isSafeInteger(h.committedBatches)||(h.committedBatches as number)<0)
  throw Error('Hosted publication health identity is not verified');
 if(h.halted!==null&&h.halted!==undefined&&typeof h.halted!=='string'&&typeof h.halted!=='boolean')
  throw Error('Hosted publication halt is not verified');
 const halted=h.halted===true||typeof h.halted==='string'&&h.halted.length>0;
 return {healthy:h.ok&&!halted,epoch:String(epoch),committedBatches:h.committedBatches as number,
  ...(halted?publicationFailureDetails(new Error(h.halted as string)):{}),observedAt:new Date().toISOString()};
}

/** Explicit comparison knob; deployments opt in after hosted measurement. */
export function agentTickInterval(value?:string){
 if(value===undefined)return 300;
 const ms=Number(value);
 if(!Number.isInteger(ms)||ms<100||ms>5000)throw Error('Agent tick interval must be 100..5000 ms');
 return ms;
}

/** Account for work already spent in this serial iteration. Never catch up in bursts. */
export function agentTickPause(interval:number,progressAge:number,blocked=false){
 if(blocked)return 100;
 return Math.max(20,Math.min(100,interval-Math.max(0,progressAge)));
}

/** Publication holds stop writes, not independent recovery observations.
 * Actual HTTP throttling still governs every request to the same node. */
export function agentRecoveryPause(publicationPaused:boolean,rpcCooldownMs:number,retryAt:number,now:number){
 return Math.max(publicationPaused?2000:1000,rpcCooldownMs,publicationPaused?0:retryAt-now);
}
