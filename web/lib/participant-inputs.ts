import type {TimedControl} from './participant-projection';
export type InputNotice={id:number;direction:-1|0|1;at:number;acceptedAt?:bigint};
/** Per-match input ledger for presentation. Signed-command ownership stays in
 * the command journal. An accepted input is retained until physics reaches it. */
export class ParticipantInputs {
 private inputs=new Map<number,InputNotice&{predictedAt:bigint}>();
 private confirmedRevision=0;
 get revision(){return this.confirmedRevision;}
 reset(){this.inputs.clear();this.confirmedRevision++;}
 notice(input:InputNotice,clock:bigint,observedAt:number){
  if(input.acceptedAt!==undefined)for(const [id,old] of this.inputs)if(id<input.id&&old.acceptedAt===undefined)this.inputs.delete(id);
  const prior=this.inputs.get(input.id);
  // An ACK can re-time prediction without a new physical snapshot. Rendering
  // must reconcile that correction, while ordinary local intent stays instant.
  if(input.acceptedAt!==undefined&&prior?.acceptedAt!==input.acceptedAt)this.confirmedRevision++;
  this.inputs.set(input.id,{...input,predictedAt:prior?.predictedAt??clock+BigInt(Math.floor(Math.max(0,Math.min(600,input.at-observedAt))*1000))});
  // Bound speculation under an outage. This never discards signed commands.
  while(this.inputs.size>128)this.inputs.delete(this.inputs.keys().next().value!);
 }
 controls(side:0|1,processed:bigint):TimedControl[]{
  let applied=0;
  for(const input of this.inputs.values())if(input.acceptedAt!==undefined&&input.acceptedAt<=processed)applied=Math.max(applied,input.id);
  for(const id of this.inputs.keys())if(id<=applied)this.inputs.delete(id);
  return [...this.inputs.values()].map(input=>({side,direction:input.direction,at:input.acceptedAt??input.predictedAt}));
 }
}
