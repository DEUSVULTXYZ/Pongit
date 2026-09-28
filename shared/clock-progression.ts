export type ClockSample={sampledAt:string;processedUs:string;renderedUs:string;finished?:string;streamStalled?:string};

/** Evaluate matched draw timestamps, not the polling time of stale DOM values.
 * A terminal/reset sample does not turn a shorter window into a passing trial. */
export function clockProgression(samples:readonly ClockSample[],minimumMs:number){
 const rows:{at:number;processed:number;rendered:number;stalled:boolean}[]=[];
 for(const sample of samples){
  const at=Number(sample.sampledAt),processed=Number(sample.processedUs)/1000,rendered=Number(sample.renderedUs)/1000;
  if(!Number.isFinite(at)||!Number.isFinite(processed)||!Number.isFinite(rendered)||sample.finished==='true')continue;
  const previous=rows.at(-1);
  if(previous&&at<=previous.at)continue;
  if(previous&&(processed<previous.processed||rendered<previous.rendered))throw Error('Clock reset inside measurement');
  rows.push({at,processed,rendered,stalled:sample.streamStalled==='true'});
 }
 const first=rows[0],last=rows.at(-1),durationMs=first&&last?last.at-first.at:0;
 if(durationMs<minimumMs)throw Error('Insufficient active clock window');
 return{samples:rows.length,durationMs,processedRatio:(last!.processed-first.processed)/durationMs,
  renderedRatio:(last!.rendered-first.rendered)/durationMs,stalledSamples:rows.filter(row=>row.stalled).length};
}
