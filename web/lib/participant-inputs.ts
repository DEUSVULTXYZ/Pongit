import type {TimedControl} from './participant-projection';
export type InputNotice={id:number;direction:-1|0|1;at:number;acceptedAt?:bigint};
export type ParticipantPresentationClock={clock:bigint;observedAt:number};
export type LocalIntent={direction:-1|0|1;at:number};
/** Local monotonic input times, independent of receipt time and RAF rounding. */
export function localMotion(inputs:readonly LocalIntent[],from:number,to:number,enabled:boolean){
 if(!enabled||to<=from)return [];
 const start=Math.max(from,to-50);let at=start,direction=0;
 const parts:{direction:number;ms:number}[]=[];
 for(const input of inputs){
  if(input.at<=start){direction=input.direction;continue;}
  if(input.at>to)break;
  parts.push({direction,ms:input.at-at});at=input.at;direction=input.direction;
 }
 parts.push({direction,ms:to-at});return parts;
}
/** Per-match input ledger for presentation. Signed-command ownership stays in
 * the command journal. An accepted input is retained until physics reaches it. */
export class ParticipantInputs {
 private inputs=new Map<number,InputNotice&{predictedAt:bigint}>();
 private confirmedRevision=0;
 private nextInputId=0;
 private local:LocalIntent[]=[];
 localIntent(direction:-1|0|1,at:number){
  if(this.local.at(-1)?.direction===direction)return;
  this.local.push({direction,at});if(this.local.length>128)this.local.shift();
 }
 get localControls():readonly LocalIntent[]{return this.local;}
 get revision(){return this.confirmedRevision;}
 /** The match owns these IDs; replacing a recovered sender must not reuse them. */
 allocateId(){return ++this.nextInputId;}
 reset(){this.inputs.clear();this.local=[];this.confirmedRevision++;}
 notice(input:InputNotice,clock:bigint,observedAt:number,presentation?:ParticipantPresentationClock){
  if(input.acceptedAt!==undefined)for(const [id,old] of this.inputs)if(id<input.id&&old.acceptedAt===undefined)this.inputs.delete(id);
  const prior=this.inputs.get(input.id);
  // An ACK can re-time prediction without a new physical snapshot. Rendering
  // must reconcile that correction, while ordinary local intent stays instant.
  if(input.acceptedAt!==undefined&&prior?.acceptedAt!==input.acceptedAt)this.confirmedRevision++;
  let predictedAt=clock+BigInt(Math.floor(Math.max(0,Math.min(600,input.at-observedAt))*1000));
  // A delayed receipt can put the raw clock behind the monotonic picture.
  // Date new intent on that picture, never replay it in the displayed past.
  // Ignore stale/foreign paints; acceptedAt always remains the engine's time.
  const age=presentation?input.at-presentation.observedAt:Infinity;
  if(presentation&&age>=0&&age<=100){
   const displayedAt=presentation.clock+BigInt(Math.floor(age*1000));
   if(displayedAt>predictedAt)predictedAt=displayedAt;
  }
  this.inputs.set(input.id,{...input,predictedAt:prior?.predictedAt??predictedAt});
  // Bound speculation under an outage. This never discards signed commands.
  while(this.inputs.size>128)this.inputs.delete(this.inputs.keys().next().value!);
 }
 controls(side:0|1,processed:bigint):TimedControl[]{
  let applied=0;
  for(const input of this.inputs.values())if(input.acceptedAt!==undefined&&input.acceptedAt<=processed)applied=Math.max(applied,input.id);
  for(const id of this.inputs.keys())if(id<=applied)this.inputs.delete(id);
  return [...this.inputs.values()].map(input=>({side,direction:input.direction,at:input.acceptedAt??input.predictedAt,confirmed:input.acceptedAt!==undefined}));
 }
}
