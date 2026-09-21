import {publicationFailureDetails} from './service-error';

/** Allowlisted node evidence only; never persist arbitrary relay responses. */
export function agentPublicationHealth(value: unknown, app: string, epoch: bigint) {
 const h=value as Record<string,unknown>;
 if(!h||typeof h.app!=='string'||h.app.toLowerCase()!==app.toLowerCase()||String(h.epoch)!==String(epoch)
  ||typeof h.ok!=='boolean'||!Number.isSafeInteger(h.committedBatches)||(h.committedBatches as number)<0)
  throw Error('Hosted publication health identity is not verified');
 const halted=typeof h.halted==='string'&&h.halted.length>0;
 return {healthy:h.ok&&!halted,epoch:String(epoch),committedBatches:h.committedBatches as number,
  ...(halted?publicationFailureDetails(new Error(h.halted as string)):{}),observedAt:new Date().toISOString()};
}

/** Private comparison knob; normal service remains at its existing cadence. */
export function agentTickInterval(value?:string){
 if(value===undefined)return 300;
 const ms=Number(value);
 if(!Number.isInteger(ms)||ms<300||ms>5000)throw Error('Agent tick interval must be 300..5000 ms');
 return ms;
}
