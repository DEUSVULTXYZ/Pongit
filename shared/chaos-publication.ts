import type {State} from './physics-v2';

/** Movement revisions may differ between the engine and Monad. The rally's
 * identity must not: never open a window against another published pause. */
export function sameChaosPause(id:bigint,expected:State,published:readonly unknown[]){
 const s=published[12] as State|undefined;
 return published[0]===id && Number(published[2])===2 && expected.mode===1 && expected.awaitingServe
  && s?.mode===1 && s.awaitingServe && s.seed===expected.seed
  && s.scoreA===expected.scoreA && s.scoreB===expected.scoreB && s.resumeAt===expected.resumeAt;
}

/** Confirmed preflight state races can be reobserved. Transport failures and
 * unrecognized reverts must remain visible in diagnostics, never swallowed. */
export function chaosWindowMoved(error:unknown){
 for(let e=error as any,n=0;e&&n<8;e=e.cause,n++){
  const reason=e.reason ?? (e.data?.errorName==='Error'?e.data.args?.[0]:undefined);
  if(['not a Chaos pause','round already opened','result already accepted'].includes(reason))return true;
  if(typeof e.details==='string' && /^execution reverted: (not a Chaos pause|round already opened|result already accepted)$/.test(e.details))return true;
 }
 return false;
}
