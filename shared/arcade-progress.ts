/** Public presentation state. No signatures, raw calls or estimated completion times. */
export type ArcadeStage = 'loading'|'connecting'|'sponsorship'|'confirmation'|'confirmed'|'searching'|'capacity'|'opponent'|'preparing'|'synchronizing'|'ready'|'unavailable'|'error';
export type ArcadeProgress = {
 stage: ArcadeStage;
 revision: string;
 observedAt: number;
 progress?: {completed:number;total:number};
};
export const arcadeStageLabels:Record<ArcadeStage,string>={
 loading:'Loading the arcade',connecting:'Confirm in your passkey',sponsorship:'Preparing your action',
 confirmation:'Confirming your action',confirmed:'Action confirmed',searching:'Finding your rival',capacity:'Waiting for an arena',
 opponent:'Waiting for your rival',preparing:'Preparing your arena',synchronizing:'Synchronizing the arena',
 ready:'Ready to play',unavailable:'Arena temporarily unavailable',error:'Action needs attention',
};
export function sponsorStage(status:'queued'|'pending'|'confirmed'|'failed'):ArcadeStage{
 return {queued:'sponsorship',pending:'confirmation',confirmed:'confirmed',failed:'error'}[status] as ArcadeStage;
}
/** Only render quantities supplied by an observed operation, never elapsed-time estimates. */
export function measuredProgress(progress?:ArcadeProgress['progress']){
 if(!progress||!Number.isFinite(progress.completed)||!Number.isFinite(progress.total)||progress.total<=0
  ||progress.completed<0||progress.completed>progress.total)return undefined;
 return progress;
}
export function challengeStage(assigned:boolean,reason?:'arena'|'match'|'tournament'):ArcadeStage{
 return assigned?'preparing':reason==='match'||reason==='tournament'?'opponent':'capacity';
}
